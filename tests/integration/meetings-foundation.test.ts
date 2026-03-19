import Database from "better-sqlite3-multiple-ciphers";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createCoreServices } from "../../packages/core/src/app";

describe("meeting foundation", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("applies meeting migration on a fresh database and supports meeting flows", () => {
    const dir = mkdtempSync(join(tmpdir(), "scope-meetings-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "scope.db");
    const services = createCoreServices(dbPath);

    const now = new Date().toISOString();
    const calendarEvent = services.repos.calendarEventRepo.upsert({
      id: "cal-1",
      provider: "google",
      providerEventId: "google-evt-1",
      title: "Customer sync",
      startsAt: now,
      attendees: [{ email: "user@example.com", name: "User" }],
      createdAt: now,
      updatedAt: now
    });

    const meeting = services.meetingService.create({
      title: "Customer sync",
      consentState: "pending",
      calendarEventId: calendarEvent.id,
      captureSource: {
        source: "calendar",
        systemAudio: true
      }
    });

    const transcriptionRef = {
      provider: "openai" as const,
      sessionId: "rt_123",
      transport: "realtime" as const,
      startedAt: now
    };

    services.meetingService.updateTranscriptionRef(meeting.id, transcriptionRef);
    services.meetingService.addNote(meeting.id, {
      kind: "summary",
      content: "Customer wants a smoother onboarding flow."
    });

    const storedMeeting = services.meetingService.linkCalendarEvent(meeting.id, calendarEvent.id);
    const notes = services.meetingService.listNotes(meeting.id);

    expect(storedMeeting.calendarEventId).toBe(calendarEvent.id);
    expect(storedMeeting.transcriptionRef).toEqual(transcriptionRef);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.meetingId).toBe(meeting.id);
    expect(services.meetingService.get(meeting.id).noteIds).toEqual([notes[0]?.id]);
    expect(services.meetingService.list().map((item) => item.id)).toContain(meeting.id);
  });

  it("applies 002_meetings.sql onto an existing database with only 001_init.sql", () => {
    const dir = mkdtempSync(join(tmpdir(), "scope-meetings-existing-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "scope.db");
    const sqlite = new Database(dbPath);
    const initSql = readFileSync(join(process.cwd(), "packages/core/src/migrations/001_init.sql"), "utf-8");
    sqlite.exec(initSql);
    sqlite
      .prepare(`INSERT INTO migrations(name, applied_at) VALUES (?, ?)`)
      .run("001_init.sql", new Date().toISOString());
    sqlite.close();

    createCoreServices(dbPath);

    const verify = new Database(dbPath, { readonly: true });
    const tables = verify
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('meetings', 'calendar_events', 'meeting_notes')`)
      .all() as Array<{ name: string }>;
    verify.close();

    expect(new Set(tables.map((row) => row.name))).toEqual(new Set(["meetings", "calendar_events", "meeting_notes"]));
  });
});
