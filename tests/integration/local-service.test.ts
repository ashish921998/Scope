import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startLocalService, type LocalService } from "../../apps/desktop/src/service/server";

const jsonFetch = async (url: string, token: string | null, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  let token: string;

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
    token = service.serviceToken;
  });

  afterAll(async () => {
    await service.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("enforces recording consent", async () => {
    const health = await jsonFetch(`http://127.0.0.1:${port}/v1/health`, null);
    expect(health.response.status).toBe(200);
    expect(health.data.ok).toBe(true);
    expect(typeof health.data.startedAt).toBe("string");
    expect(typeof health.data.uptimeSec).toBe("number");

    const { response } = await jsonFetch(`http://127.0.0.1:${port}/v1/interviews/start`, token, {
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
      const { response } = await jsonFetch(`http://127.0.0.1:${port}/v1/signals/ingest`, token, {
        method: "POST",
        body: JSON.stringify(signal)
      });
      expect(response.status).toBe(201);
    }

    const stream = await jsonFetch(`http://127.0.0.1:${port}/v1/signals/stream`, token);
    expect(stream.response.status).toBe(200);
    expect(stream.data.items.length).toBeGreaterThanOrEqual(3);
  });

  it("exposes realtime transcription endpoints with key enforcement", async () => {
    const startInterview = await jsonFetch(`http://127.0.0.1:${port}/v1/interviews/start`, token, {
      method: "POST",
      body: JSON.stringify({ consentAccepted: true })
    });
    expect(startInterview.response.status).toBe(201);

    const interviewId = startInterview.data.id as string;

    const startTranscription = await jsonFetch(
      `http://127.0.0.1:${port}/v1/interviews/${interviewId}/transcription/start`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ language: "en" })
      }
    );

    expect(startTranscription.response.status).toBe(400);
    expect(String(startTranscription.data.error)).toContain("OpenAI provider key");
  });

  it("exposes meeting transcription endpoints with Deepgram key enforcement", async () => {
    const startMeeting = await jsonFetch(`http://127.0.0.1:${port}/v1/meetings/start`, token, {
      method: "POST",
      body: JSON.stringify({ title: "Customer sync" })
    });
    expect(startMeeting.response.status).toBe(201);

    const meetingId = startMeeting.data.id as string;

    const startTranscription = await jsonFetch(
      `http://127.0.0.1:${port}/v1/meetings/${meetingId}/transcription/start`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ language: "en" })
      }
    );

    expect(startTranscription.response.status).toBe(400);
    expect(String(startTranscription.data.error)).toContain("Deepgram provider key");
  });

  it("auto-ingests interview transcript segments into signal stream", async () => {
    const interview = await jsonFetch(`http://127.0.0.1:${port}/v1/interviews/start`, token, {
      method: "POST",
      body: JSON.stringify({ consentAccepted: true })
    });
    expect(interview.response.status).toBe(201);

    const interviewId = String(interview.data.id);
    const append = await jsonFetch(`http://127.0.0.1:${port}/v1/interviews/${interviewId}/transcript`, token, {
      method: "POST",
      body: JSON.stringify({
        segments: [
          {
            id: "seg-auto-1",
            speaker: "customer",
            text: "Interview says onboarding setup is too manual",
            timestampMs: 10
          }
        ]
      })
    });
    expect(append.response.status).toBe(200);

    const stream = await jsonFetch(`http://127.0.0.1:${port}/v1/signals/stream`, token);
    expect(stream.response.status).toBe(200);
    const interviewSignal = (stream.data.items as Array<{ source: string; sourceRef: string }>).find(
      (item) => item.source === "interview" && item.sourceRef.includes(interviewId)
    );
    expect(interviewSignal).toBeTruthy();
  });

  it("routes transcript callbacks by explicit session kind", async () => {
    const routedDir = mkdtempSync(join(tmpdir(), "scope-test-routing-"));
    const routedPort = 4515;
    let shutdownCalled = false;

    const routedService = await startLocalService({
      dbPath: join(routedDir, "scope.db"),
      port: routedPort,
      keychainStore: {
        saveProviderKey: async () => {},
        getProviderKey: async () => null,
        saveIntegrationToken: async () => {},
        getIntegrationToken: async () => null
      } as never,
      transcriptionFactory: ({ onTranscriptSegments }) => ({
        start: async (ref) => ({
          sessionId: ref.id,
          sessionKind: ref.kind,
          started: true
        }),
        appendAudio: async (ref) => {
          onTranscriptSegments(ref, [
            {
              id: `${ref.kind}-seg`,
              speaker: ref.kind === "meeting" ? "system" : "customer",
              text: `${ref.kind} transcript`,
              timestampMs: 123
            }
          ]);
          return { accepted: true };
        },
        stop: async (ref) => ({
          sessionId: ref.id,
          sessionKind: ref.kind,
          realtimeEvents: 0,
          transcriptSegmentsProduced: 1,
          fallbackUsed: false
        }),
        shutdown: async () => {
          shutdownCalled = true;
        }
      })
    });

    const routedToken = routedService.serviceToken;

    try {
      const interview = await jsonFetch(`http://127.0.0.1:${routedPort}/v1/interviews/start`, routedToken, {
        method: "POST",
        body: JSON.stringify({ consentAccepted: true })
      });
      expect(interview.response.status).toBe(201);

      const meeting = await jsonFetch(`http://127.0.0.1:${routedPort}/v1/meetings/start`, routedToken, {
        method: "POST",
        body: JSON.stringify({ title: "Weekly sync" })
      });
      expect(meeting.response.status).toBe(201);

      const interviewId = String(interview.data.id);
      const meetingId = String(meeting.data.id);

      const interviewChunk = await jsonFetch(
        `http://127.0.0.1:${routedPort}/v1/interviews/${interviewId}/transcription/chunk`,
        routedToken,
        {
          method: "POST",
          body: JSON.stringify({ audioBase64: "YQ==" })
        }
      );
      expect(interviewChunk.response.status).toBe(202);

      const meetingChunk = await jsonFetch(
        `http://127.0.0.1:${routedPort}/v1/meetings/${meetingId}/transcription/chunk`,
        routedToken,
        {
          method: "POST",
          body: JSON.stringify({ audioBase64: "YQ==" })
        }
      );
      expect(meetingChunk.response.status).toBe(202);

      const interviewTranscript = await jsonFetch(
        `http://127.0.0.1:${routedPort}/v1/interviews/${interviewId}/transcript`,
        routedToken
      );
      expect(interviewTranscript.response.status).toBe(200);
      expect(interviewTranscript.data.transcriptSegments).toHaveLength(1);
      expect(interviewTranscript.data.transcriptSegments[0].text).toBe("interview transcript");

      const meetingTranscript = await jsonFetch(
        `http://127.0.0.1:${routedPort}/v1/meetings/${meetingId}/transcript`,
        routedToken
      );
      expect(meetingTranscript.response.status).toBe(200);
      expect(meetingTranscript.data.transcriptSegments).toHaveLength(1);
      expect(meetingTranscript.data.transcriptSegments[0].text).toBe("meeting transcript");
    } finally {
      await routedService.close();
      expect(shutdownCalled).toBe(true);
      rmSync(routedDir, { recursive: true, force: true });
    }
  });

  it("starts with strict encrypted DB mode enabled", async () => {
    const encryptedDir = mkdtempSync(join(tmpdir(), "scope-test-encrypted-"));
    const encryptedService = await startLocalService({
      dbPath: join(encryptedDir, "scope.db"),
      port: 4512,
      dbEncryptionKey: "integration-test-key",
      dbEncryptionRequired: true,
      dbCipher: "sqlcipher",
      keychainStore: {
        saveProviderKey: async () => {},
        getProviderKey: async () => null,
        saveIntegrationToken: async () => {},
        getIntegrationToken: async () => null
      } as never
    });

    const health = await jsonFetch(`http://127.0.0.1:4512/v1/health`, null);
    expect(health.response.status).toBe(200);

    await encryptedService.close();
    rmSync(encryptedDir, { recursive: true, force: true });
  });

  it("provides diagnostics bundle and sends it to configured webhook", async () => {
    const diagnosticsDir = mkdtempSync(join(tmpdir(), "scope-test-diagnostics-"));
    const diagnosticsLogPath = join(diagnosticsDir, "scope.log");
    writeFileSync(
      diagnosticsLogPath,
      [
        '{"at":"2026-03-05T10:00:00.000Z","level":"info","message":"boot"}',
        '{"at":"2026-03-05T10:00:01.000Z","level":"error","message":"boom"}'
      ].join("\n")
    );

    const diagnosticsPort = 4514;
    const originalWebhook = process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL;
    const originalAuthToken = process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN;
    const originalSigningSecret = process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET;
    const originalRateLimitMax = process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_MAX;
    const originalRateLimitWindow = process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_WINDOW_MS;
    process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL = "https://support.example.com/diagnostics";
    process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN = "diag-auth-token";
    process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET = "diag-signing-secret";
    process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_MAX = "1";
    process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_WINDOW_MS = "60000";

    const diagnosticsService = await startLocalService({
      dbPath: join(diagnosticsDir, "scope.db"),
      port: diagnosticsPort,
      diagnosticsLogPath,
      keychainStore: {
        saveProviderKey: async () => {},
        getProviderKey: async () => null,
        saveIntegrationToken: async () => {},
        getIntegrationToken: async () => null
      } as never
    });
    const diagToken = diagnosticsService.serviceToken;

    const realFetch = globalThis.fetch;
    let webhookPayload: unknown = null;
    let webhookHeaders: HeadersInit | undefined;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.startsWith(`http://127.0.0.1:${diagnosticsPort}/`)) {
        return realFetch(input, init);
      }

      if (url === "https://support.example.com/diagnostics") {
        webhookPayload = init?.body ? JSON.parse(String(init.body)) : null;
        webhookHeaders = init?.headers;
        return new Response(JSON.stringify({ ok: true, ticketId: "SUP-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: `Unhandled URL in diagnostics test: ${url}` }), { status: 500 });
    }) as typeof fetch;

    try {
      const preview = await jsonFetch(`http://127.0.0.1:${diagnosticsPort}/v1/support/diagnostics`, diagToken);
      expect(preview.response.status).toBe(200);
      expect(preview.data.logs.lineCount).toBeGreaterThan(0);
      expect(String(preview.data.health.service)).toContain("scope-local-service");

      const redactedPreview = await jsonFetch(
        `http://127.0.0.1:${diagnosticsPort}/v1/support/diagnostics?includeEmail=true&redactUserContext=true&redactLogs=true`,
        diagToken
      );
      expect(redactedPreview.response.status).toBe(200);
      expect(JSON.stringify(redactedPreview.data.logs.lines)).toContain("[REDACTED]");

      const send = await jsonFetch(`http://127.0.0.1:${diagnosticsPort}/v1/support/diagnostics/send`, diagToken, {
        method: "POST",
        body: JSON.stringify({
          email: "ashish@example.com",
          notes: "Issue after interview stop with sk-123456789012345678901234",
          includeLogs: true,
          includeHealth: true,
          includeEmail: true,
          redactLogs: true,
          redactUserContext: true
        })
      });

      expect(send.response.status).toBe(200);
      expect(send.data.ok).toBe(true);
      expect(send.data.referenceId).toBe("SUP-123");
      expect(webhookPayload).toBeTruthy();
      const payload = webhookPayload as { userContext?: { email?: string; notes?: string }; logs?: { lineCount?: number; lines?: string[] } };
      expect(payload.userContext?.email).toBe("[REDACTED]");
      expect(String(payload.userContext?.notes)).toContain("[REDACTED]");
      expect((payload.logs?.lineCount ?? 0) > 0).toBe(true);
      expect(JSON.stringify(payload.logs?.lines ?? [])).toContain("[REDACTED]");
      const headers = new Headers((webhookHeaders ?? {}) as HeadersInit);
      expect(headers.get("authorization")).toBe("Bearer diag-auth-token");
      expect(String(headers.get("x-scope-signature")).startsWith("sha256=")).toBe(true);
      expect((headers.get("x-scope-signature-timestamp") ?? "").length > 0).toBe(true);

      const sendAgain = await jsonFetch(`http://127.0.0.1:${diagnosticsPort}/v1/support/diagnostics/send`, diagToken, {
        method: "POST",
        body: JSON.stringify({
          email: "ashish@example.com",
          notes: "retry"
        })
      });
      expect(sendAgain.response.status).toBe(429);
    } finally {
      globalThis.fetch = realFetch;
      if (originalWebhook === undefined) {
        delete process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL;
      } else {
        process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL = originalWebhook;
      }
      if (originalAuthToken === undefined) {
        delete process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN;
      } else {
        process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN = originalAuthToken;
      }
      if (originalSigningSecret === undefined) {
        delete process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET;
      } else {
        process.env.SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET = originalSigningSecret;
      }
      if (originalRateLimitMax === undefined) {
        delete process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_MAX;
      } else {
        process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_MAX = originalRateLimitMax;
      }
      if (originalRateLimitWindow === undefined) {
        delete process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_WINDOW_MS;
      } else {
        process.env.SCOPE_SUPPORT_SEND_RATE_LIMIT_WINDOW_MS = originalRateLimitWindow;
      }
      await diagnosticsService.close();
      rmSync(diagnosticsDir, { recursive: true, force: true });
    }
  });

  it("syncs slack, linear, and posthog integrations into canonical signals", async () => {
    const syncDir = mkdtempSync(join(tmpdir(), "scope-test-sync-"));
    const syncPort = 4513;
    const syncService = await startLocalService({
      dbPath: join(syncDir, "scope.db"),
      port: syncPort,
      dbEncryptionKey: "integration-test-key",
      dbEncryptionRequired: true,
      dbCipher: "sqlcipher",
      keychainStore: {
        saveProviderKey: async () => {},
        getProviderKey: async () => null,
        saveIntegrationToken: async () => {},
        getIntegrationToken: async (provider: string) => {
          const byProvider: Record<string, { provider: string; accessToken: string }> = {
            slack: { provider: "slack", accessToken: "slack-token" },
            linear: { provider: "linear", accessToken: "linear-token" },
            posthog: { provider: "posthog", accessToken: "posthog-token" }
          };
          return byProvider[provider] ?? null;
        }
      } as never
    });

    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.startsWith(`http://127.0.0.1:${syncPort}/`)) {
        return realFetch(input, init);
      }

      if (url.startsWith("https://slack.com/api/conversations.history")) {
        return new Response(
          JSON.stringify({
            ok: true,
            messages: [{ ts: "1711111111.000200", text: "Slack says onboarding is confusing" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "https://api.linear.app/graphql") {
        return new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    id: "lin-issue-1",
                    identifier: "LIN-1",
                    title: "Need onboarding templates",
                    description: "Users repeatedly request setup automation"
                  }
                ]
              }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.startsWith("https://app.posthog.com/api/projects/2/events/")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                uuid: "ph-ev-1",
                event: "signup_dropoff",
                properties: { $pathname: "/signup" }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ error: `Unhandled URL in test: ${url}` }), { status: 500 });
    }) as typeof fetch;

    const syncToken = syncService.serviceToken;

    try {
      const syncResult = await jsonFetch(`http://127.0.0.1:${syncPort}/v1/integrations/sync`, syncToken, {
        method: "POST",
        body: JSON.stringify({
          providers: ["slack", "linear", "posthog"],
          slack: { channelId: "C123", limit: 10 },
          linear: { limit: 10 },
          posthog: { projectId: "2", limit: 10 }
        })
      });
      expect(syncResult.response.status).toBe(200);
      expect(syncResult.data.totals.pulled).toBeGreaterThanOrEqual(3);

      const stream = await jsonFetch(`http://127.0.0.1:${syncPort}/v1/signals/stream`, syncToken);
      const sources = new Set((stream.data.items as Array<{ source: string }>).map((item) => item.source));
      expect(sources.has("slack")).toBe(true);
      expect(sources.has("linear")).toBe(true);
      expect(sources.has("posthog")).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
      await syncService.close();
      rmSync(syncDir, { recursive: true, force: true });
    }
  });
});
