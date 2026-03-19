import { describe, expect, it, vi } from "vitest";
import type { InterviewSession } from "@scope/types";
import {
  buildScopePmMeetingSyncPayload,
  resolveScopePmMeetingSyncConfig,
  syncMeetingToScopePm
} from "../../apps/desktop/src/meetings/webSync";

const completedMeeting: InterviewSession = {
  id: "meeting-123",
  status: "completed",
  consentAccepted: true,
  startedAt: "2026-03-19T10:00:00.000Z",
  endedAt: "2026-03-19T10:30:00.000Z",
  transcriptSegments: [
    {
      id: "seg-1",
      speaker: "interviewer",
      text: "Tell me about onboarding.",
      timestampMs: 1000
    },
    {
      id: "seg-2",
      speaker: "customer",
      text: "It still feels manual.",
      timestampMs: 2000
    }
  ],
  followups: [],
  debrief: {
    keyTakeaways: ["Onboarding is still manual."],
    actionItems: ["Reduce setup time"],
    painPoints: [{ title: "Manual setup", severity: "medium", evidence: "It still feels manual." }],
    featureValidations: [],
    knowledgeGaps: [],
    risks: [],
    nextSteps: []
  }
};

describe("resolveScopePmMeetingSyncConfig", () => {
  it("returns null when config is missing", () => {
    expect(resolveScopePmMeetingSyncConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("syncMeetingToScopePm", () => {
  it("returns skipped when sync config is missing", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const result = await syncMeetingToScopePm({
      meeting: completedMeeting,
      logger,
      env: {} as NodeJS.ProcessEnv
    });

    expect(result).toEqual({
      ok: true,
      status: "skipped",
      reason: "missing_config"
    });
    expect(logger.info).toHaveBeenCalledWith("ScopePM meeting sync skipped", {
      reason: "missing_config"
    });
  });

  it("sends the expected request body for a completed meeting", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ action: "created" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const env = {
      SCOPEPM_SYNC_BASE_URL: "https://scopepm.example.com/",
      SCOPEPM_SYNC_TOKEN: "sync-token",
      SCOPEPM_SYNC_PROJECT_ID: "42"
    } as NodeJS.ProcessEnv;

    const result = await syncMeetingToScopePm({
      meeting: completedMeeting,
      fetchImpl,
      env
    });

    expect(result.status).toBe("created");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://scopepm.example.com/api/meetings/ingest");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sync-token",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(init.body))).toEqual({
      externalMeetingId: "meeting-123",
      projectId: 42,
      title: "Scope meeting 2026-03-19 (meeting-123)",
      transcript: "interviewer: Tell me about onboarding.\ncustomer: It still feels manual.",
      summary: "Onboarding is still manual.",
      debrief: completedMeeting.debrief,
      sourceStartedAt: "2026-03-19T10:00:00.000Z",
      sourceEndedAt: "2026-03-19T10:30:00.000Z"
    });
  });

  it("builds a stable retry payload for the same meeting", () => {
    const config = {
      baseUrl: "https://scopepm.example.com",
      syncToken: "sync-token",
      projectId: 42
    };

    const first = buildScopePmMeetingSyncPayload(completedMeeting, config);
    const second = buildScopePmMeetingSyncPayload(completedMeeting, config);

    expect(first).toEqual(second);
    expect(first.externalMeetingId).toBe("meeting-123");
  });
});
