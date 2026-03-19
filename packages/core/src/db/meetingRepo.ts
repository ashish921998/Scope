import type { MeetingNote, MeetingSession, TranscriptionSessionRef } from "@scope/types";
import type { ScopeDb } from "./client";
import { parseJson } from "./parseJson";

export class MeetingRepo {
  constructor(private readonly db: ScopeDb) {}

  private mapMeetingRow(
    row: {
      id: string;
      status: MeetingSession["status"];
      title: string;
      consent_state: MeetingSession["consentState"];
      started_at: string | null;
      ended_at: string | null;
      calendar_event_id: string | null;
      transcription_ref_json: string | null;
      capture_source_json: string | null;
      metadata_json: string | null;
      created_at: string;
      updated_at: string;
    },
    noteIds: string[]
  ): MeetingSession {
    return {
      id: row.id,
      status: row.status,
      title: row.title,
      consentState: row.consent_state,
      startedAt: row.started_at ?? undefined,
      endedAt: row.ended_at ?? undefined,
      calendarEventId: row.calendar_event_id ?? undefined,
      transcriptionRef: parseJson(row.transcription_ref_json, undefined),
      captureSource: parseJson(row.capture_source_json, undefined),
      metadata: parseJson(row.metadata_json, undefined),
      noteIds,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  create(session: MeetingSession) {
    this.db.sqlite
      .prepare(
        `INSERT INTO meetings(
          id, status, title, consent_state, started_at, ended_at, calendar_event_id, transcription_ref_json,
          capture_source_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.status,
        session.title,
        session.consentState,
        session.startedAt ?? null,
        session.endedAt ?? null,
        session.calendarEventId ?? null,
        session.transcriptionRef ? JSON.stringify(session.transcriptionRef) : null,
        session.captureSource ? JSON.stringify(session.captureSource) : null,
        session.metadata ? JSON.stringify(session.metadata) : null,
        session.createdAt,
        session.updatedAt
      );

    return session;
  }

  updateMeeting(session: MeetingSession) {
    this.db.sqlite
      .prepare(
        `UPDATE meetings
         SET status = ?, title = ?, consent_state = ?, started_at = ?, ended_at = ?, calendar_event_id = ?,
             transcription_ref_json = ?, capture_source_json = ?, metadata_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        session.status,
        session.title,
        session.consentState,
        session.startedAt ?? null,
        session.endedAt ?? null,
        session.calendarEventId ?? null,
        session.transcriptionRef ? JSON.stringify(session.transcriptionRef) : null,
        session.captureSource ? JSON.stringify(session.captureSource) : null,
        session.metadata ? JSON.stringify(session.metadata) : null,
        session.updatedAt,
        session.id
      );

    return session;
  }

  updateTranscriptionRef(id: string, transcriptionRef: TranscriptionSessionRef | undefined, updatedAt: string) {
    this.db.sqlite
      .prepare(`UPDATE meetings SET transcription_ref_json = ?, updated_at = ? WHERE id = ?`)
      .run(transcriptionRef ? JSON.stringify(transcriptionRef) : null, updatedAt, id);
  }

  linkCalendarEvent(id: string, calendarEventId: string | undefined, updatedAt: string) {
    this.db.sqlite
      .prepare(`UPDATE meetings SET calendar_event_id = ?, updated_at = ? WHERE id = ?`)
      .run(calendarEventId ?? null, updatedAt, id);
  }

  appendNote(note: MeetingNote) {
    this.db.sqlite
      .prepare(
        `INSERT INTO meeting_notes(id, meeting_id, content, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(note.id, note.meetingId, note.content, note.kind, note.createdAt, note.updatedAt);

    return note;
  }

  listNotes(meetingId: string) {
    const rows = this.db.sqlite
      .prepare(`SELECT * FROM meeting_notes WHERE meeting_id = ? ORDER BY created_at ASC`)
      .all(meetingId) as Array<{
      id: string;
      meeting_id: string;
      content: string;
      kind: MeetingNote["kind"];
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(
      (row): MeetingNote => ({
        id: row.id,
        meetingId: row.meeting_id,
        content: row.content,
        kind: row.kind,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })
    );
  }

  get(id: string): MeetingSession | undefined {
    const row = this.db.sqlite.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as
      | {
          id: string;
          status: MeetingSession["status"];
          title: string;
          consent_state: MeetingSession["consentState"];
          started_at: string | null;
          ended_at: string | null;
          calendar_event_id: string | null;
          transcription_ref_json: string | null;
          capture_source_json: string | null;
          metadata_json: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    const notes = this.listNotes(row.id);

    return this.mapMeetingRow(
      row,
      notes.map((note) => note.id)
    );
  }

  list(limit = 50) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
    const rows = this.db.sqlite
      .prepare(`SELECT * FROM meetings ORDER BY created_at DESC LIMIT ?`)
      .all(safeLimit) as Array<{
      id: string;
      status: MeetingSession["status"];
      title: string;
      consent_state: MeetingSession["consentState"];
      started_at: string | null;
      ended_at: string | null;
      calendar_event_id: string | null;
      transcription_ref_json: string | null;
      capture_source_json: string | null;
      metadata_json: string | null;
      created_at: string;
      updated_at: string;
    }>;

    if (rows.length === 0) {
      return [];
    }

    const noteRows = this.db.sqlite
      .prepare(
        `SELECT meeting_id, id
         FROM meeting_notes
         WHERE meeting_id IN (${rows.map(() => "?").join(", ")})
         ORDER BY created_at ASC`
      )
      .all(...rows.map((row) => row.id)) as Array<{ meeting_id: string; id: string }>;

    const noteIdsByMeeting = new Map<string, string[]>();
    for (const noteRow of noteRows) {
      const existing = noteIdsByMeeting.get(noteRow.meeting_id);
      if (existing) {
        existing.push(noteRow.id);
      } else {
        noteIdsByMeeting.set(noteRow.meeting_id, [noteRow.id]);
      }
    }

    return rows.map((row) => this.mapMeetingRow(row, noteIdsByMeeting.get(row.id) ?? []));
  }
}
