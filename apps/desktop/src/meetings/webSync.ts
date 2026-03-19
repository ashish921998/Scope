import type { InterviewSession } from "@scope/types";
import type { AppLogger } from "../telemetry/logger";

export interface ScopePmMeetingSyncConfig {
  baseUrl: string;
  syncToken: string;
  projectId: number;
}

export interface ScopePmMeetingSyncPayload {
  externalMeetingId: string;
  projectId: number;
  title: string;
  transcript: string;
  summary: string | null;
  debrief: InterviewSession["debrief"] | null;
  sourceStartedAt: string;
  sourceEndedAt: string | null;
}

export interface ScopePmMeetingSyncResult {
  ok: true;
  status: "skipped" | "created" | "updated";
  reason?: string;
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const parseProjectId = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const buildTranscript = (meeting: InterviewSession) =>
  meeting.transcriptSegments
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n")
    .trim();

const buildTitle = (meeting: InterviewSession) => {
  const date = meeting.startedAt.slice(0, 10);
  return `Scope meeting ${date} (${meeting.id})`;
};

export const resolveScopePmMeetingSyncConfig = (
  env: NodeJS.ProcessEnv = process.env
): ScopePmMeetingSyncConfig | null => {
  const baseUrl = env.SCOPEPM_SYNC_BASE_URL?.trim();
  const syncToken = env.SCOPEPM_SYNC_TOKEN?.trim();
  const projectId = parseProjectId(env.SCOPEPM_SYNC_PROJECT_ID?.trim());

  if (!baseUrl || !syncToken || !projectId) {
    return null;
  }

  return {
    baseUrl: trimTrailingSlash(baseUrl),
    syncToken,
    projectId
  };
};

export const buildScopePmMeetingSyncPayload = (
  meeting: InterviewSession,
  config: ScopePmMeetingSyncConfig
): ScopePmMeetingSyncPayload => ({
  externalMeetingId: meeting.id,
  projectId: config.projectId,
  title: buildTitle(meeting),
  transcript: buildTranscript(meeting),
  summary: meeting.debrief?.keyTakeaways?.[0] ?? null,
  debrief: meeting.debrief ?? null,
  sourceStartedAt: meeting.startedAt,
  sourceEndedAt: meeting.endedAt ?? null
});

export const syncMeetingToScopePm = async (params: {
  meeting: InterviewSession;
  logger?: AppLogger;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}): Promise<ScopePmMeetingSyncResult> => {
  const config = resolveScopePmMeetingSyncConfig(params.env);
  if (!config) {
    params.logger?.info("ScopePM meeting sync skipped", {
      reason: "missing_config"
    });
    return {
      ok: true,
      status: "skipped",
      reason: "missing_config"
    };
  }

  const payload = buildScopePmMeetingSyncPayload(params.meeting, config);
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(`${config.baseUrl}/api/meetings/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.syncToken}`
    },
    body: JSON.stringify(payload)
  });

  const data = (await response.json().catch(() => ({}))) as {
    action?: "created" | "updated";
    error?: string;
  };

  if (!response.ok || (data.action !== "created" && data.action !== "updated")) {
    throw new Error(data.error ?? `ScopePM meeting sync failed with status ${response.status}`);
  }

  params.logger?.info("ScopePM meeting sync completed", {
    action: data.action,
    externalMeetingId: payload.externalMeetingId,
    projectId: payload.projectId
  });

  return {
    ok: true,
    status: data.action
  };
};
