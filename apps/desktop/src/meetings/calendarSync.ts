import { safeFetch } from "@scope/core";
import type { IntegrationProvider } from "@scope/types";
import { refreshIntegrationToken } from "../auth/oauth";
import type { KeychainStore } from "../security/keychain";

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  organizer?: string;
  attendees: string[];
  conferenceUrl?: string;
  conferenceProvider?: "zoom" | "teams";
  description?: string;
}

export type MeetingConfidence = "low" | "medium" | "high";

export interface MeetingCandidate {
  key: string;
  confidence: MeetingConfidence;
  process: {
    provider: "zoom" | "teams";
    processName: string;
    command: string;
  };
  event?: CalendarEvent;
  title: string;
}

export interface CalendarSnapshot {
  events: CalendarEvent[];
  refreshedAt?: string;
  lastError?: string;
}

const GOOGLE_PROVIDER: IntegrationProvider = "google_calendar";

const expiresSoon = (expiresAt?: string, skewMs = 90_000) => {
  if (!expiresAt) {
    return false;
  }
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry - Date.now() <= skewMs;
};

const parseConferenceProvider = (value: string | undefined): "zoom" | "teams" | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized.includes("zoom")) {
    return "zoom";
  }
  if (normalized.includes("teams") || normalized.includes("microsoft")) {
    return "teams";
  }
  return undefined;
};

const normalizeCalendarEvent = (item: Record<string, unknown>): CalendarEvent | null => {
  const id = String(item.id ?? "").trim();
  const title = String(item.summary ?? "Upcoming meeting").trim() || "Upcoming meeting";
  const startAt = String((item.start as { dateTime?: string } | undefined)?.dateTime ?? "").trim();
  const endAt = String((item.end as { dateTime?: string } | undefined)?.dateTime ?? "").trim();
  if (!id || !startAt || !endAt) {
    return null;
  }

  const organizer = String((item.organizer as { email?: string } | undefined)?.email ?? "").trim() || undefined;
  const attendees = Array.isArray(item.attendees)
    ? item.attendees
        .map((entry) => String((entry as { email?: string }).email ?? "").trim())
        .filter(Boolean)
    : [];
  const conferenceUrl =
    String((item.hangoutLink as string | undefined) ?? "").trim() ||
    String(
      ((item.conferenceData as { entryPoints?: Array<{ uri?: string }> } | undefined)?.entryPoints ?? []).find(
        (entry) => typeof entry?.uri === "string" && entry.uri.trim().length > 0
      )?.uri ?? ""
    ).trim() ||
    undefined;
  const description = String(item.description ?? "").trim() || undefined;

  return {
    id,
    title,
    startAt,
    endAt,
    organizer,
    attendees,
    conferenceUrl,
    conferenceProvider: parseConferenceProvider(`${conferenceUrl ?? ""} ${description ?? ""} ${title}`),
    description
  };
};

export const eventMatchesProcess = (event: CalendarEvent, provider: "zoom" | "teams") => {
  const haystack = [event.title, event.description, event.conferenceUrl, event.organizer, ...event.attendees]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return provider === "zoom" ? haystack.includes("zoom") : haystack.includes("teams") || haystack.includes("microsoft");
};

export const findMeetingCandidate = (
  processes: Array<{ provider: "zoom" | "teams"; processName: string; command: string }>,
  events: CalendarEvent[],
  now = new Date()
): MeetingCandidate | null => {
  const nowMs = now.getTime();
  for (const process of processes) {
    const nearbyEvent =
      events.find((event) => {
        const start = Date.parse(event.startAt);
        const end = Date.parse(event.endAt);
        return Number.isFinite(start) && Number.isFinite(end) && start - 15 * 60_000 <= nowMs && end + 5 * 60_000 >= nowMs;
      }) ?? undefined;

    if (!nearbyEvent) {
      return {
        key: `process:${process.provider}`,
        confidence: "low",
        process,
        title: `${process.processName} meeting detected`
      };
    }

    const confidence: MeetingConfidence = eventMatchesProcess(nearbyEvent, process.provider) ? "high" : "medium";
    return {
      key: `${process.provider}:${nearbyEvent.id}:${confidence}`,
      confidence,
      process,
      event: nearbyEvent,
      title: nearbyEvent.title
    };
  }

  return null;
};

export class GoogleCalendarSync {
  private timer: NodeJS.Timeout | null = null;
  private snapshot: CalendarSnapshot = { events: [] };

  constructor(
    private readonly deps: {
      keychainStore: KeychainStore;
      refreshMs?: number;
      onUpdate?: (snapshot: CalendarSnapshot) => void;
      onError?: (error: unknown) => void;
      fetchImpl?: typeof safeFetch;
      now?: () => Date;
    }
  ) {}

  start() {
    if (this.timer) {
      return;
    }

    const run = async () => {
      try {
        const events = await this.fetchUpcomingEvents();
        this.snapshot = {
          events,
          refreshedAt: (this.deps.now ?? (() => new Date()))().toISOString(),
          lastError: undefined
        };
        this.deps.onUpdate?.({ ...this.snapshot, events: [...events] });
      } catch (error) {
        this.snapshot = {
          ...this.snapshot,
          lastError: error instanceof Error ? error.message : String(error)
        };
        this.deps.onError?.(error);
      }
    };

    void run();
    this.timer = setInterval(() => {
      void run();
    }, this.deps.refreshMs ?? 300_000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSnapshot() {
    return {
      ...this.snapshot,
      events: [...this.snapshot.events]
    };
  }

  async fetchUpcomingEvents() {
    const accessToken = await this.resolveAccessToken();
    if (!accessToken) {
      return [];
    }

    const now = (this.deps.now ?? (() => new Date()))();
    const windowStart = new Date(now.getTime() - 15 * 60_000).toISOString();
    const windowEnd = new Date(now.getTime() + 60 * 60_000).toISOString();
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: windowStart,
      timeMax: windowEnd,
      maxResults: "20"
    });

    const response = await (this.deps.fetchImpl ?? safeFetch)(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    const data = (await response.json().catch(() => ({}))) as { items?: Array<Record<string, unknown>>; error?: unknown };
    if (!response.ok) {
      throw new Error(`Google Calendar sync failed: ${JSON.stringify(data.error ?? data)}`);
    }

    return (data.items ?? [])
      .map((item) => normalizeCalendarEvent(item))
      .filter((item): item is CalendarEvent => Boolean(item));
  }

  private async resolveAccessToken() {
    const token = await this.deps.keychainStore.getIntegrationToken(GOOGLE_PROVIDER);
    if (!token?.accessToken) {
      return null;
    }

    if (token.refreshToken && expiresSoon(token.expiresAt)) {
      const refreshed = await refreshIntegrationToken(GOOGLE_PROVIDER, token.refreshToken);
      await this.deps.keychainStore.saveIntegrationToken(refreshed);
      return refreshed.accessToken;
    }

    return token.accessToken;
  }
}
