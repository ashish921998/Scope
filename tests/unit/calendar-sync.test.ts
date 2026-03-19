import { assertAllowedEgress } from "../../packages/core/src/security/egress";
import { eventMatchesProcess, findMeetingCandidate, GoogleCalendarSync, type CalendarEvent } from "../../apps/desktop/src/meetings/calendarSync";

const now = new Date("2026-03-19T10:00:00.000Z");

const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "evt-1",
  title: "Customer sync",
  startAt: "2026-03-19T09:55:00.000Z",
  endAt: "2026-03-19T10:30:00.000Z",
  attendees: ["person@example.com"],
  ...overrides
});

describe("calendar matching", () => {
  it("returns low confidence when only a process is active", () => {
    const candidate = findMeetingCandidate(
      [{ provider: "zoom", processName: "Zoom", command: "zoom.us" }],
      [],
      now
    );

    expect(candidate?.confidence).toBe("low");
  });

  it("returns medium confidence for nearby events without explicit provider metadata", () => {
    const candidate = findMeetingCandidate(
      [{ provider: "teams", processName: "Microsoft Teams", command: "Teams" }],
      [makeEvent()],
      now
    );

    expect(candidate?.confidence).toBe("medium");
    expect(candidate?.event?.id).toBe("evt-1");
  });

  it("returns high confidence when event metadata matches the process provider", () => {
    const event = makeEvent({
      conferenceUrl: "https://teams.microsoft.com/l/meetup-join/abc",
      description: "Join via Microsoft Teams"
    });

    expect(eventMatchesProcess(event, "teams")).toBe(true);

    const candidate = findMeetingCandidate(
      [{ provider: "teams", processName: "Microsoft Teams", command: "Teams" }],
      [event],
      now
    );

    expect(candidate?.confidence).toBe("high");
  });

  it("allows required google hosts for calendar oauth and api calls", () => {
    expect(() => assertAllowedEgress("https://accounts.google.com/o/oauth2/v2/auth")).not.toThrow();
    expect(() => assertAllowedEgress("https://oauth2.googleapis.com/token")).not.toThrow();
    expect(() => assertAllowedEgress("https://www.googleapis.com/calendar/v3/calendars/primary/events")).not.toThrow();
  });
});

describe("google calendar sync", () => {
  it("refreshes expiring google tokens before fetching events", async () => {
    const keychainStore = {
      getIntegrationToken: vi.fn(async () => ({
        provider: "google_calendar",
        accessToken: "stale-token",
        refreshToken: "refresh-me",
        expiresAt: new Date(now.getTime() + 1_000).toISOString()
      })),
      saveIntegrationToken: vi.fn(async () => {})
    };

    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({
            access_token: "fresh-token",
            refresh_token: "refresh-me",
            expires_in: 3600,
            token_type: "Bearer"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          items: [
            {
              id: "evt-1",
              summary: "Weekly sync",
              start: { dateTime: "2026-03-19T09:55:00.000Z" },
              end: { dateTime: "2026-03-19T10:30:00.000Z" }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    try {
      process.env.GOOGLE_CLIENT_ID = "google-client";
      process.env.GOOGLE_CLIENT_SECRET = "google-secret";
      const sync = new GoogleCalendarSync({
        keychainStore: keychainStore as never,
        now: () => now
      });

      const events = await sync.fetchUpcomingEvents();
      expect(events).toHaveLength(1);
      expect(keychainStore.saveIntegrationToken).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google_calendar",
          accessToken: "fresh-token"
        })
      );
    } finally {
      globalThis.fetch = realFetch;
      if (previousClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = previousClientId;
      }
      if (previousClientSecret === undefined) {
        delete process.env.GOOGLE_CLIENT_SECRET;
      } else {
        process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
      }
    }
  });
});
