import type { Express } from "express";
import type { AppLogger } from "../../telemetry/logger";
import { buildDiagnosticsWebhookHeaders } from "../../support/webhookSigning";
import { buildDiagnosticsBundle, extractReferenceId } from "../utils/diagnostics";

interface DiagnosticsRouteDeps {
  appVersion: string;
  dbPath: string;
  diagnosticsLogPath?: string;
  diagnosticsLimiter: { allow(key: string): boolean };
  buildHealthPayload: () => Record<string, unknown>;
  logger?: AppLogger;
}

export const registerDiagnosticsRoutes = (app: Express, deps: DiagnosticsRouteDeps) => {
  const { appVersion, dbPath, diagnosticsLogPath, diagnosticsLimiter, buildHealthPayload, logger } = deps;

  app.get("/v1/support/diagnostics", (req, res) => {
    try {
      const maxLogLinesRaw = Number(req.query.maxLogLines ?? 300);
      const maxLogLines = Number.isFinite(maxLogLinesRaw) ? Math.max(50, Math.min(2000, maxLogLinesRaw)) : 300;
      const bundle = buildDiagnosticsBundle({
        appVersion,
        dbPath,
        health: buildHealthPayload(),
        logPath: diagnosticsLogPath,
        maxLogLines,
        includeLogs: req.query.includeLogs !== "false",
        includeHealth: req.query.includeHealth !== "false",
        includeEmail: req.query.includeEmail === "true",
        redactLogs: req.query.redactLogs !== "false",
        redactUserContext: req.query.redactUserContext !== "false"
      });
      res.status(200).json(bundle);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/support/diagnostics/send", async (req, res) => {
    const requesterKey = req.ip || req.socket.remoteAddress || "local";
    if (!diagnosticsLimiter.allow(requesterKey)) {
      res.status(429).json({
        error: "Diagnostics send rate limit exceeded. Please retry shortly."
      });
      return;
    }

    const endpoint = process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL?.trim();
    if (!endpoint) {
      res.status(400).json({
        error: "SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL is not configured."
      });
      return;
    }

    try {
      const requestBytes = Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf-8");
      const maxRequestBytes = Number(process.env.SCOPE_SUPPORT_MAX_REQUEST_BYTES ?? "32768");
      if (requestBytes > maxRequestBytes) {
        res.status(413).json({
          error: `Diagnostics request too large (${requestBytes} bytes > ${maxRequestBytes} bytes).`
        });
        return;
      }

      const maxLogLinesRaw = Number(req.body?.maxLogLines ?? 300);
      const maxLogLines = Number.isFinite(maxLogLinesRaw) ? Math.max(50, Math.min(2000, maxLogLinesRaw)) : 300;
      const notes = typeof req.body?.notes === "string" ? req.body.notes.slice(0, 2000) : undefined;
      const email = typeof req.body?.email === "string" ? req.body.email.slice(0, 320) : undefined;
      const bundle = buildDiagnosticsBundle({
        appVersion,
        dbPath,
        health: buildHealthPayload(),
        logPath: diagnosticsLogPath,
        maxLogLines,
        notes,
        email,
        includeLogs: req.body?.includeLogs !== false,
        includeHealth: req.body?.includeHealth !== false,
        includeEmail: req.body?.includeEmail === true,
        redactLogs: req.body?.redactLogs !== false,
        redactUserContext: req.body?.redactUserContext !== false
      });
      const body = JSON.stringify(bundle);
      const headers = buildDiagnosticsWebhookHeaders({
        body,
        authToken: process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN,
        signingSecret: process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Diagnostics webhook failed: ${response.status} ${text}`);
      }

      const responseContentType = response.headers.get("content-type") ?? "";
      const providerResponse =
        responseContentType.includes("application/json")
          ? await response.json().catch(() => null)
          : await response.text().catch(() => "");
      const referenceId = extractReferenceId(providerResponse);

      logger?.info("Diagnostics sent", {
        endpoint,
        logLines: bundle.logs.lineCount,
        referenceId
      });

      res.status(200).json({
        ok: true,
        sentAt: new Date().toISOString(),
        endpoint,
        logLines: bundle.logs.lineCount,
        referenceId,
        providerResponse
      });
    } catch (error) {
      logger?.warn("Diagnostics send failed", { error });
      res.status(500).json({ error: (error as Error).message });
    }
  });
};
