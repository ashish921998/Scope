import { describe, expect, it } from "vitest";
import { initDb } from "../../packages/core/src/db/client";
import { MeetingRepo } from "../../packages/core/src/db/meetingRepo";
import { MeetingService } from "../../packages/core/src/meetings/service";

describe("MeetingService", () => {
  const buildService = () => {
    const db = initDb(":memory:");
    return new MeetingService(new MeetingRepo(db));
  };

  it("requires consent before starting", () => {
    const service = buildService();
    expect(() => service.start(false)).toThrow("Recording consent is required");
  });

  it("orders appended transcript segments by timestamp", () => {
    const service = buildService();
    const meeting = service.start(true, "Ordering test");

    const result = service.appendTranscript(meeting.id, [
      { id: "b", speaker: "system", text: "Second", timestampMs: 20, source: "system" },
      { id: "a", speaker: "me", text: "First", timestampMs: 10, source: "mic" }
    ]);

    expect(result.transcriptSegments.map((segment) => segment.id)).toEqual(["a", "b"]);
  });

  it("generates notes when the meeting stops", () => {
    const service = buildService();
    const meeting = service.start(true, "Notes test");
    service.appendTranscript(meeting.id, [
      {
        id: "seg-1",
        speaker: "me",
        text: "We agreed the onboarding checklist will ship next sprint.",
        timestampMs: 1,
        source: "mic"
      },
      {
        id: "seg-2",
        speaker: "system",
        text: "Action item: follow up on permissions audit.",
        timestampMs: 2,
        source: "system"
      }
    ]);

    const completed = service.stop(meeting.id);

    expect(completed.status).toBe("completed");
    expect(completed.notes?.summary).toContain("We agreed");
    expect(completed.notes?.actionItems.length).toBeGreaterThan(0);
  });

  it("lists recent meetings in reverse chronological order", () => {
    const service = buildService();
    const first = service.start(true, "First meeting");
    const second = service.start(true, "Second meeting");

    const recent = service.listRecent();

    expect(recent.map((meeting) => meeting.id)).toEqual([second.id, first.id]);
  });
});
