import type { MeetingNote, MeetingSession, TranscriptionSessionRef } from "@scope/types";
import { CalendarEventRepo } from "../db/calendarEventRepo";
import { MeetingRepo } from "../db/meetingRepo";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";

export class MeetingService {
  constructor(
    private readonly meetingRepo: MeetingRepo,
    private readonly calendarEventRepo: CalendarEventRepo
  ) {}

  create(input: {
    title: string;
    consentState?: MeetingSession["consentState"];
    status?: MeetingSession["status"];
    startedAt?: string;
    calendarEventId?: string;
    captureSource?: MeetingSession["captureSource"];
    metadata?: MeetingSession["metadata"];
  }): MeetingSession {
    const now = nowIso();
    const session: MeetingSession = {
      id: newId(),
      status: input.status ?? "scheduled",
      title: input.title.trim(),
      consentState: input.consentState ?? "pending",
      startedAt: input.startedAt,
      calendarEventId: input.calendarEventId,
      captureSource: input.captureSource,
      metadata: input.metadata,
      noteIds: [],
      createdAt: now,
      updatedAt: now
    };

    if (session.calendarEventId && !this.calendarEventRepo.get(session.calendarEventId)) {
      throw new Error("Calendar event not found.");
    }

    return this.meetingRepo.create(session);
  }

  get(id: string) {
    const session = this.meetingRepo.get(id);
    if (!session) {
      throw new Error("Meeting session not found.");
    }
    return session;
  }

  list(limit?: number) {
    return this.meetingRepo.list(limit);
  }

  updateTranscriptionRef(meetingId: string, transcriptionRef: TranscriptionSessionRef) {
    this.get(meetingId);
    this.meetingRepo.updateTranscriptionRef(meetingId, transcriptionRef, nowIso());
    return this.get(meetingId);
  }

  linkCalendarEvent(meetingId: string, calendarEventId: string) {
    this.get(meetingId);
    if (!this.calendarEventRepo.get(calendarEventId)) {
      throw new Error("Calendar event not found.");
    }
    this.meetingRepo.linkCalendarEvent(meetingId, calendarEventId, nowIso());
    return this.get(meetingId);
  }

  addNote(meetingId: string, input: { content: string; kind: MeetingNote["kind"] }) {
    this.get(meetingId);
    const now = nowIso();
    const note: MeetingNote = {
      id: newId(),
      meetingId,
      content: input.content.trim(),
      kind: input.kind,
      createdAt: now,
      updatedAt: now
    };
    this.meetingRepo.appendNote(note);
    return note;
  }

  listNotes(meetingId: string) {
    this.get(meetingId);
    return this.meetingRepo.listNotes(meetingId);
  }
}
