import express from "express";
import {
  createInMemoryReplayProtectionStore,
  verifyDiagnosticsWebhookSignature
} from "../../apps/desktop/src/support/webhookSigning";

const app = express();
app.use(express.json({ limit: "256kb", verify: (req, _res, buf) => ((req as any).rawBody = buf.toString("utf-8")) }));

const authToken = process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN?.trim();
const signingSecret = process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET?.trim();
const replayStore = createInMemoryReplayProtectionStore({
  ttlMs: 5 * 60 * 1000,
  maxEntries: 10_000
});

app.post("/diagnostics", (req, res) => {
  if (authToken) {
    const expected = `Bearer ${authToken}`;
    const provided = req.header("authorization") ?? "";
    if (provided !== expected) {
      res.status(401).json({ ok: false, error: "invalid_auth" });
      return;
    }
  }

  if (signingSecret) {
    const rawBody = String((req as any).rawBody ?? "");
    const signatureHeader = req.header("x-scope-signature");
    const timestampHeader = req.header("x-scope-signature-timestamp");
    const verification = verifyDiagnosticsWebhookSignature({
      body: rawBody,
      signingSecret,
      signatureHeader,
      timestampHeader,
      toleranceMs: 5 * 60 * 1000
    });

    if (!verification.ok) {
      res.status(401).json({ ok: false, error: verification.reason });
      return;
    }

    const replayCheck = replayStore.consume({
      signature: signatureHeader ?? "",
      timestamp: timestampHeader ?? ""
    });
    if (!replayCheck.ok) {
      res.status(409).json({ ok: false, error: replayCheck.reason });
      return;
    }
  }

  const referenceId = `SUP-${Date.now().toString().slice(-6)}`;
  console.info("Accepted diagnostics bundle", {
    referenceId,
    generatedAt: req.body?.generatedAt,
    appVersion: req.body?.appVersion
  });

  res.status(200).json({
    ok: true,
    ticketId: referenceId
  });
});

const port = Number(process.env.PORT ?? "8787");
app.listen(port, () => {
  console.log(`Support diagnostics webhook listening on http://127.0.0.1:${port}/diagnostics`);
});
