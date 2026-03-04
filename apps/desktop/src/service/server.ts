import { createCoreServices } from "@scope/core";
import type { IntegrationProvider, TranscriptSegment } from "@scope/types";
import cors from "cors";
import express from "express";
import { dossierToMarkdown, pushDossierToJira, pushDossierToLinear } from "@scope/core";
import type { KeychainStore } from "../security/keychain";

export interface LocalService {
  port: number;
  close: () => Promise<void>;
}

export const startLocalService = async (params: {
  dbPath: string;
  keychainStore: KeychainStore;
  port?: number;
}): Promise<LocalService> => {
  const app = express();
  const services = createCoreServices(params.dbPath);
  const port = params.port ?? 4010;

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/v1/health", (_req, res) => {
    res.json({ ok: true, service: "scope-local-service" });
  });

  app.post("/v1/interviews/start", (req, res) => {
    try {
      const consentAccepted = Boolean(req.body?.consentAccepted);
      const session = services.interviewService.start(consentAccepted);
      res.status(201).json(session);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/interviews/:id/transcript", (req, res) => {
    try {
      const segments = (req.body?.segments ?? []) as TranscriptSegment[];
      const result = services.interviewService.appendTranscript(req.params.id, segments);
      res.status(200).json(result);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/interviews/:id/stop", (req, res) => {
    try {
      const session = services.interviewService.stop(req.params.id);
      res.status(200).json(session);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/interviews/:id/transcript", (req, res) => {
    try {
      const transcript = services.interviewService.getTranscript(req.params.id);
      res.status(200).json(transcript);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/signals/ingest", (req, res) => {
    try {
      const result = services.signalService.ingest(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/signals/stream", (req, res) => {
    const limit = Number(req.query.limit ?? 200);
    const signals = services.signalService.stream(limit);
    res.status(200).json({ items: signals });
  });

  app.post("/v1/features/ghost/scan", (_req, res) => {
    try {
      const result = services.signalService.scanGhostFeatures();
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/dossiers/generate", (req, res) => {
    try {
      const dossier = services.dossierService.generate(req.body);
      res.status(201).json(dossier);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/dossiers/:id", (req, res) => {
    const dossier = services.dossierService.get(req.params.id);
    if (!dossier) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.status(200).json(dossier);
  });

  app.post("/v1/export/dossier", (req, res) => {
    try {
      const exported = services.exportService.exportDossier(req.body);
      res.status(200).json(exported);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/export/linear", async (req, res) => {
    try {
      const exported = services.exportService.exportDossier(req.body);
      const linearToken = await params.keychainStore.getIntegrationToken("linear");
      const apiKey = req.body.apiKey ?? linearToken?.accessToken;

      if (!apiKey || !req.body.issueId) {
        res.status(400).json({ error: "Missing Linear credentials or issue ID." });
        return;
      }

      const rawDossier = services.dossierService.get(req.body.dossierId);
      if (!rawDossier) {
        res.status(404).json({ error: "Dossier not found." });
        return;
      }

      await pushDossierToLinear({
        apiKey,
        issueId: req.body.issueId,
        markdown: exported.format === "markdown" ? exported.content : dossierToMarkdown(rawDossier)
      });

      res.status(200).json({ ok: true, content: exported.content });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/export/jira", async (req, res) => {
    try {
      const exported = services.exportService.exportDossier(req.body);
      const token = await params.keychainStore.getIntegrationToken("jira");
      const authHeader = req.body.authHeader ?? (token ? `Bearer ${token.accessToken}` : null);
      const baseUrl = req.body.baseUrl as string;
      const issueKey = req.body.issueKey as string;

      if (!authHeader || !baseUrl || !issueKey) {
        res.status(400).json({ error: "Missing Jira credentials or destination metadata." });
        return;
      }

      await pushDossierToJira({
        baseUrl,
        authHeader,
        issueKey,
        markdown: exported.content
      });

      res.status(200).json({ ok: true, content: exported.content });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/auth/integration/token", async (req, res) => {
    try {
      const provider = req.body.provider as IntegrationProvider;
      await params.keychainStore.saveIntegrationToken({
        provider,
        accessToken: req.body.accessToken,
        refreshToken: req.body.refreshToken,
        expiresAt: req.body.expiresAt,
        scope: req.body.scope
      });
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(port, "127.0.0.1", () => resolve(instance));
  });

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
};
