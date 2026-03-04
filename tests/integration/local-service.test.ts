import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startLocalService, type LocalService } from "../../apps/desktop/src/service/server";

const jsonFetch = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

describe("local service API", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "scope-test-"));
  const port = 4510;
  let service: LocalService;

  beforeAll(async () => {
    service = await startLocalService({
      dbPath: join(tempDir, "scope.db"),
      port,
      keychainStore: {
        saveProviderKey: async () => {},
        getProviderKey: async () => null,
        saveIntegrationToken: async () => {},
        getIntegrationToken: async () => null
      } as never
    });
  });

  afterAll(async () => {
    await service.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("enforces recording consent", async () => {
    const { response } = await jsonFetch(`http://127.0.0.1:${port}/v1/interviews/start`, {
      method: "POST",
      body: JSON.stringify({ consentAccepted: false })
    });

    expect(response.status).toBe(400);
  });

  it("ingests and streams signals from slack, linear, posthog", async () => {
    const signals = [
      {
        source: "slack",
        sourceRef: "s-1",
        text: "Users report onboarding is frustrating and manual"
      },
      {
        source: "linear",
        sourceRef: "l-1",
        text: "Feature request: add onboarding templates"
      },
      {
        source: "posthog",
        sourceRef: "p-1",
        text: "Funnel conversion drops after signup"
      }
    ];

    for (const signal of signals) {
      const { response } = await jsonFetch(`http://127.0.0.1:${port}/v1/signals/ingest`, {
        method: "POST",
        body: JSON.stringify(signal)
      });
      expect(response.status).toBe(201);
    }

    const stream = await jsonFetch(`http://127.0.0.1:${port}/v1/signals/stream`);
    expect(stream.response.status).toBe(200);
    expect(stream.data.items.length).toBeGreaterThanOrEqual(3);
  });
});
