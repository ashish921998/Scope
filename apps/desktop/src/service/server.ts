import { randomBytes } from "node:crypto";
import { createCoreServices } from "@scope/core";
import cors from "cors";
import express from "express";
import type { KeychainStore } from "../security/keychain";
import { IntegrationSyncService } from "../integrations/syncService";
import type { AppLogger } from "../telemetry/logger";
import { OpenAIRealtimeTranscription } from "../transcription";
import { registerInterviewRoutes } from "./routes/interviews";
import { registerSignalRoutes } from "./routes/signals";
import { registerDossierRoutes } from "./routes/dossiers";
import { registerIntegrationRoutes } from "./routes/integrations";
import { registerDiagnosticsRoutes } from "./routes/diagnostics";
import { createRateLimiter } from "./middleware/rateLimiter";

export interface LocalService {
  port: number;
  serviceToken: string;
  close: () => Promise<void>;
}

export const startLocalService = async (params: {
  dbPath: string;
  keychainStore: KeychainStore;
  dbEncryptionKey?: string;
  dbEncryptionRequired?: boolean;
  dbCipher?: string;
  diagnosticsLogPath?: string;
  logger?: AppLogger;
  port?: number;
}): Promise<LocalService> => {
  const app = express();
  const startupAt = new Date();
  const serviceToken = randomBytes(32).toString("hex");
  const services = createCoreServices(params.dbPath, {
    encryptionKey: params.dbEncryptionKey,
    requireEncryption: params.dbEncryptionRequired,
    cipher: params.dbCipher,
    getAnthropicKey: () => params.keychainStore.getProviderKey("anthropic")
  });
  const integrationSync = new IntegrationSyncService({
    signalService: services.signalService,
    keychainStore: params.keychainStore,
    logger: params.logger
  });
  const transcription = new OpenAIRealtimeTranscription({
    getOpenAIKey: () => params.keychainStore.getProviderKey("openai"),
    onTranscriptSegments: (interviewId, segments) => {
      try {
        services.interviewService.appendTranscript(interviewId, segments);
      } catch (error) {
        params.logger?.warn("Unable to append realtime transcript segment", { error });
      }
    },
    logger: params.logger ?? console
  });
  const port = params.port ?? 4010;
  const autoSyncSeconds = Number(process.env.SCOPE_INTEGRATIONS_AUTO_SYNC_SECONDS ?? "0");
  const autoSyncEnabled = Number.isFinite(autoSyncSeconds) && autoSyncSeconds > 0;
  const autoSyncTimer = autoSyncEnabled
    ? setInterval(() => {
        integrationSync
          .sync({})
          .catch((error) => params.logger?.warn("Background integration sync failed", { error }));
      }, autoSyncSeconds * 1000)
    : null;

  let activeRequests = 0;
  const appVersion = process.env.npm_package_version ?? "0.1.0";
  const diagnosticsLimiter = createRateLimiter({
    windowMs: Number(process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_WINDOW_MS ?? "60000"),
    maxRequests: Number(process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_MAX ?? "5")
  });

  const buildHealthPayload = () => ({
    ok: true,
    service: "scope-local-service",
    startedAt: startupAt.toISOString(),
    uptimeSec: Math.floor((Date.now() - startupAt.getTime()) / 1000),
    activeRequests,
    integrationSync: integrationSync.getHealthSnapshot()
  });

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost") || origin === "null") {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    }
  }));
  app.use(express.json({ limit: "5mb" }));
  app.use((req, res, next) => {
    if (req.path === "/v1/health" || req.method === "OPTIONS") {
      return next();
    }
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${serviceToken}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  });
  app.use((req, res, next) => {
    const startedAt = Date.now();
    activeRequests += 1;
    res.on("finish", () => {
      activeRequests -= 1;
      params.logger?.info("http_request", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs: Date.now() - startedAt
      });
    });
    next();
  });

  app.get("/v1/health", (_req, res) => {
    res.json(buildHealthPayload());
  });

  registerInterviewRoutes(app, { services, transcription, logger: params.logger });
  registerSignalRoutes(app, { services });
  registerDossierRoutes(app, { services, keychainStore: params.keychainStore });
  registerIntegrationRoutes(app, { keychainStore: params.keychainStore, integrationSync, logger: params.logger });
  registerDiagnosticsRoutes(app, {
    appVersion,
    dbPath: params.dbPath,
    diagnosticsLogPath: params.diagnosticsLogPath,
    diagnosticsLimiter,
    buildHealthPayload,
    logger: params.logger
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(port, "127.0.0.1", () => resolve(instance));
  });

  return {
    port,
    serviceToken,
    close: async () => {
      if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
      }
      await transcription.shutdown();
      params.logger?.info("Local service shutdown complete");
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            params.logger?.error("Local service shutdown failed", { error });
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
};
