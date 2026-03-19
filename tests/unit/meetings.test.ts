import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initDb } from "../../packages/core/src/db/client";
import { MeetingRepo } from "../../packages/core/src/db/meetingRepo";
import { MeetingService } from "../../packages/core/src/meetings/service";
import { generateMeetingNotesFallback } from "../../packages/core/src/meetings/notesPipeline";
import { normalizeSource } from "../../packages/core/src/signals/normalizer";

describe("meeting domain", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts, appends sorted transcript segments, and completes with deterministic notes", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "scope-meeting-unit-"));
    tempDirs.push(tempDir);
    const db = initDb(join(tempDir, "scope.db"));
    const service = new MeetingService(new MeetingRepo(db));

    const meeting = service.start();
    expect(meeting.status).toBe("active");
    expect(meeting.transcriptSegments).toEqual([]);

    service.appendTranscript(meeting.id, [
      {
        id: "seg-2",
        speaker: "customer",
        text: "Action item: send the updated rollout plan.",
        timestampMs: 20
      },
      {
        id: "seg-1",
        speaker: "customer",
        text: "We decided to ship the settings page next sprint.",
        timestampMs: 10
      }
    ]);

    const completed = await service.stop(meeting.id);
    expect(completed.status).toBe("completed");
    expect(completed.transcriptSegments.map((segment) => segment.id)).toEqual(["seg-1", "seg-2"]);
    expect(completed.notes?.summary).toContain("We decided");
    expect(completed.notes?.decisions.length).toBeGreaterThan(0);
    expect(completed.notes?.actionItems.length).toBeGreaterThan(0);
  });

  it("produces stable fallback notes for the same transcript input", () => {
    const segments = [
      {
        id: "seg-1",
        speaker: "customer" as const,
        text: "We agreed to expand the beta. Action item: create the rollout checklist.",
        timestampMs: 10
      },
      {
        id: "seg-2",
        speaker: "interviewer" as const,
        text: "Can we confirm the owner for support docs?",
        timestampMs: 20
      }
    ];

    expect(generateMeetingNotesFallback(segments)).toEqual(generateMeetingNotesFallback(segments));
  });

  it("normalizes meeting as a valid signal source", () => {
    expect(normalizeSource("meeting")).toBe("meeting");
  });
});
