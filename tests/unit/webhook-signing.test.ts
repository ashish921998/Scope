import {
  buildDiagnosticsWebhookHeaders,
  createInMemoryReplayProtectionStore,
  verifyDiagnosticsWebhookSignature
} from "../../apps/desktop/src/support/webhookSigning";

describe("diagnostics webhook signing", () => {
  it("builds signed headers and verifies successfully", () => {
    const body = JSON.stringify({ hello: "world" });
    const headers = buildDiagnosticsWebhookHeaders({
      body,
      signingSecret: "test-secret",
      authToken: "auth-token",
      nowMs: 1_700_000_000_000
    });

    expect(headers.Authorization).toBe("Bearer auth-token");
    expect(headers["X-Scope-Signature"]).toBeTruthy();
    expect(headers["X-Scope-Signature-Timestamp"]).toBe("1700000000000");

    const verified = verifyDiagnosticsWebhookSignature({
      body,
      signingSecret: "test-secret",
      signatureHeader: headers["X-Scope-Signature"],
      timestampHeader: headers["X-Scope-Signature-Timestamp"],
      nowMs: 1_700_000_000_000
    });

    expect(verified.ok).toBe(true);
  });

  it("rejects bad signature and stale timestamp", () => {
    const body = JSON.stringify({ value: 1 });
    const headers = buildDiagnosticsWebhookHeaders({
      body,
      signingSecret: "right-secret",
      nowMs: 1_700_000_000_000
    });

    const badSig = verifyDiagnosticsWebhookSignature({
      body,
      signingSecret: "wrong-secret",
      signatureHeader: headers["X-Scope-Signature"],
      timestampHeader: headers["X-Scope-Signature-Timestamp"],
      nowMs: 1_700_000_000_000
    });
    expect(badSig.ok).toBe(false);

    const stale = verifyDiagnosticsWebhookSignature({
      body,
      signingSecret: "right-secret",
      signatureHeader: headers["X-Scope-Signature"],
      timestampHeader: headers["X-Scope-Signature-Timestamp"],
      nowMs: 1_700_000_000_000 + 10 * 60 * 1000,
      toleranceMs: 60_000
    });
    expect(stale.ok).toBe(false);
  });

  it("rejects replayed signatures within the TTL window", () => {
    const store = createInMemoryReplayProtectionStore({
      ttlMs: 60_000,
      maxEntries: 10
    });

    const first = store.consume({
      signature: "sha256=abc",
      timestamp: "1700000000000",
      nowMs: 1_700_000_000_000
    });
    expect(first.ok).toBe(true);

    const second = store.consume({
      signature: "sha256=abc",
      timestamp: "1700000000000",
      nowMs: 1_700_000_000_500
    });
    expect(second.ok).toBe(false);

    const third = store.consume({
      signature: "sha256=abc",
      timestamp: "1700000000000",
      nowMs: 1_700_000_061_000
    });
    expect(third.ok).toBe(true);
  });
});
