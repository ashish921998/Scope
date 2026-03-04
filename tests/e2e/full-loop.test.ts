import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startLocalService, type LocalService } from "../../apps/desktop/src/service/server";

const jsonFetch = async <T = unknown>(url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
};

describe("end-to-end core loop", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "scope-e2e-"));
  const port = 4511;
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

  it("runs interview -> signals -> ghost -> dossier -> export", async () => {
    const interview = (await jsonFetch<{ id: string }>(`http://127.0.0.1:${port}/v1/interviews/start`, {
      method: "POST",
      body: JSON.stringify({ consentAccepted: true })
    })) as { id: string };

    await jsonFetch(`http://127.0.0.1:${port}/v1/interviews/${interview.id}/transcript`, {
      method: "POST",
      body: JSON.stringify({
        segments: [
          {
            id: "seg-1",
            speaker: "customer",
            text: "Onboarding setup is manual and slow",
            timestampMs: 1
          }
        ]
      })
    });

    await jsonFetch(`http://127.0.0.1:${port}/v1/interviews/${interview.id}/stop`, {
      method: "POST",
      body: JSON.stringify({})
    });

    const inputs = [
      "Manual onboarding workflow slows enterprise setup",
      "Need automation for onboarding setup steps",
      "Onboarding process is confusing and too manual"
    ];

    for (let i = 0; i < inputs.length; i += 1) {
      await jsonFetch(`http://127.0.0.1:${port}/v1/signals/ingest`, {
        method: "POST",
        body: JSON.stringify({
          source: i === 2 ? "posthog" : i === 1 ? "linear" : "slack",
          sourceRef: `ref-${i}`,
          text: inputs[i]
        })
      });
    }

    const ghost = await jsonFetch<{ candidates: Array<{ id: string }> }>(`http://127.0.0.1:${port}/v1/features/ghost/scan`, {
      method: "POST",
      body: JSON.stringify({})
    });

    expect(ghost.candidates.length).toBeGreaterThan(0);

    const dossier = await jsonFetch<{ id: string }>(`http://127.0.0.1:${port}/v1/dossiers/generate`, {
      method: "POST",
      body: JSON.stringify({ featureId: ghost.candidates[0].id })
    });

    const exported = await jsonFetch<{ content: string }>(`http://127.0.0.1:${port}/v1/export/dossier`, {
      method: "POST",
      body: JSON.stringify({
        featureId: ghost.candidates[0].id,
        dossierId: dossier.id,
        format: "markdown"
      })
    });

    expect(exported.content).toContain("# Feature Dossier");
    expect(exported.content).toContain("## Acceptance Criteria");
  });
});
