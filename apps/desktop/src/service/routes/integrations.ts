import type { IntegrationProvider } from "@scope/types";
import type { Express } from "express";
import type { KeychainStore } from "../../security/keychain";
import { refreshIntegrationToken } from "../../auth/oauth";
import type { IntegrationSyncService } from "../../integrations/syncService";
import type { AppLogger } from "../../telemetry/logger";

interface IntegrationRouteDeps {
  keychainStore: KeychainStore;
  integrationSync: IntegrationSyncService;
  logger?: AppLogger;
}

export const registerIntegrationRoutes = (app: Express, deps: IntegrationRouteDeps) => {
  const { keychainStore, integrationSync, logger } = deps;

  app.post("/v1/auth/integration/token", async (req, res) => {
    try {
      const provider = req.body.provider as IntegrationProvider;
      await keychainStore.saveIntegrationToken({
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

  app.post("/v1/auth/integration/refresh", async (req, res) => {
    try {
      const provider = req.body.provider as IntegrationProvider;
      const existing = await keychainStore.getIntegrationToken(provider);
      if (!existing?.refreshToken) {
        res.status(400).json({ error: `No refresh token found for provider: ${provider}` });
        return;
      }

      const refreshed = await refreshIntegrationToken(provider, existing.refreshToken);
      await keychainStore.saveIntegrationToken(refreshed);

      res.status(200).json({
        ok: true,
        provider,
        expiresAt: refreshed.expiresAt,
        scope: refreshed.scope
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/integrations/sync", async (req, res) => {
    try {
      const result = await integrationSync.sync(req.body ?? {});
      res.status(200).json(result);
    } catch (error) {
      logger?.warn("Integration sync failed", { error });
      res.status(400).json({ error: (error as Error).message });
    }
  });
};
