import type { Express } from "express";
import type { CoreServices } from "@scope/core";

interface SignalRouteDeps {
  services: CoreServices;
}

export const registerSignalRoutes = (app: Express, deps: SignalRouteDeps) => {
  const { services } = deps;

  app.post("/v1/signals/ingest", (req, res) => {
    try {
      const result = services.signalService.ingest(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/signals/stream", (req, res) => {
    const rawLimit = Number(req.query.limit ?? 200);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 200;
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
};
