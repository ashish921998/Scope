import type { Express } from "express";
import type { CoreServices } from "@scope/core";
import { dossierToMarkdown, pushDossierToJira, pushDossierToLinear } from "@scope/core";
import type { KeychainStore } from "../../security/keychain";

interface DossierRouteDeps {
  services: CoreServices;
  keychainStore: KeychainStore;
}

export const registerDossierRoutes = (app: Express, deps: DossierRouteDeps) => {
  const { services, keychainStore } = deps;

  app.post("/v1/dossiers/generate", async (req, res) => {
    try {
      const dossier = await services.dossierService.generate(req.body);
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
      const linearToken = await keychainStore.getIntegrationToken("linear");
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
      const token = await keychainStore.getIntegrationToken("jira");
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
};
