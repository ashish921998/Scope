import { createHmac, timingSafeEqual } from "node:crypto";

export type SigningHeaders = Record<string, string>;
export interface ReplayProtectionStore {
  consume: (params: { signature: string; timestamp: string; nowMs?: number }) => {
    ok: true;
  } | {
    ok: false;
    reason: "replayed";
  };
}

export const buildDiagnosticsWebhookHeaders = (params: {
  body: string;
  authToken?: string;
  signingSecret?: string;
  nowMs?: number;
}): SigningHeaders => {
  const headers: SigningHeaders = {
    "Content-Type": "application/json"
  };

  if (params.authToken?.trim()) {
    headers.Authorization = `Bearer ${params.authToken.trim()}`;
  }

  if (params.signingSecret?.trim()) {
    const timestamp = String(params.nowMs ?? Date.now());
    const signature = createHmac("sha256", params.signingSecret.trim())
      .update(`${timestamp}.${params.body}`)
      .digest("hex");
    headers["X-Scope-Signature-Timestamp"] = timestamp;
    headers["X-Scope-Signature"] = `sha256=${signature}`;
  }

  return headers;
};

export const verifyDiagnosticsWebhookSignature = (params: {
  body: string;
  signingSecret: string;
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  toleranceMs?: number;
  nowMs?: number;
}) => {
  const providedSignature = params.signatureHeader?.trim();
  const providedTimestamp = params.timestampHeader?.trim();
  if (!providedSignature || !providedTimestamp) {
    return { ok: false as const, reason: "missing_headers" as const };
  }

  const prefix = "sha256=";
  if (!providedSignature.startsWith(prefix)) {
    return { ok: false as const, reason: "invalid_format" as const };
  }

  const expectedDigest = createHmac("sha256", params.signingSecret)
    .update(`${providedTimestamp}.${params.body}`)
    .digest("hex");
  const providedDigest = providedSignature.slice(prefix.length);
  const expectedBuffer = Buffer.from(expectedDigest, "hex");
  const providedBuffer = Buffer.from(providedDigest, "hex");
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    return { ok: false as const, reason: "bad_signature" as const };
  }

  const timestampMs = Number(providedTimestamp);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false as const, reason: "bad_timestamp" as const };
  }

  const tolerance = params.toleranceMs ?? 5 * 60 * 1000;
  const nowMs = params.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestampMs) > tolerance) {
    return { ok: false as const, reason: "stale_timestamp" as const };
  }

  return { ok: true as const };
};

export const createInMemoryReplayProtectionStore = (params?: { ttlMs?: number; maxEntries?: number }): ReplayProtectionStore => {
  const ttlMs = params?.ttlMs ?? 5 * 60 * 1000;
  const maxEntries = params?.maxEntries ?? 10_000;
  const seen = new Map<string, number>();

  return {
    consume: ({ signature, timestamp, nowMs }) => {
      const now = nowMs ?? Date.now();
      const cutoff = now - ttlMs;

      for (const [key, expiresAt] of seen.entries()) {
        if (expiresAt <= cutoff) {
          seen.delete(key);
        }
      }

      const compoundKey = `${timestamp}:${signature}`;
      if (seen.has(compoundKey)) {
        return {
          ok: false as const,
          reason: "replayed" as const
        };
      }

      seen.set(compoundKey, now);

      if (seen.size > maxEntries) {
        const oldestKey = seen.keys().next().value as string | undefined;
        if (oldestKey) {
          seen.delete(oldestKey);
        }
      }

      return {
        ok: true as const
      };
    }
  };
};
