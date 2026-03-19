import type { MeetingNotes, MeetingParticipant, MeetingSession, TranscriptSegment } from "@scope/types";
import type { ScopeDb } from "./client";
import { parseJson } from "./parseJson";

export class MeetingRepo {
  constructor(private readonly db: ScopeDb) {}

  create(session: MeetingSession) {
    this.db.sqlite
      .prepare(
        `INSERT INTO meetings(
          id, title, status, platform, started_at, ended_at, participants_json, transcript_json, notes_json, calendar_event_id, duration_ms
        )
         VALUES (@id, @title, @status, @platform, @startedAt, @endedAt, @participantsJson, @transcriptJson, @notesJson, @calendarEventId, @durationMs)`
      )
      .run({
        id: session.id,
        title: session.title,
        status: session.status,
        platform: session.platform ?? null,
        startedAt: session.startedAt,
        endedAt: session.endedAt ?? null,
        participantsJson: JSON.stringify(session.participants),
        transcriptJson: JSON.stringify(session.transcriptSegments),
        notesJson: session.notes ? JSON.stringify(session.notes) : null,
        calendarEventId: session.calendarEventId ?? null,
        durationMs: session.durationMs ?? null
      });

    return session;
  }

  updateTranscript(id: string, transcriptSegments: TranscriptSegment[]) {
    this.db.sqlite
      .prepare(`UPDATE meetings SET transcript_json = ? WHERE id = ?`)
      .run(JSON.stringify(transcriptSegments), id);
  }

  updateNotes(id: string, notes: MeetingNotes) {
    this.db.sqlite.prepare(`UPDATE meetings SET notes_json = ? WHERE id = ?`).run(JSON.stringify(notes), id);
  }

  complete(id: string, endedAt: string, durationMs: number) {
    this.db.sqlite
      .prepare(`UPDATE meetings SET status = 'completed', ended_at = ?, duration_ms = ? WHERE id = ?`)
      .run(endedAt, durationMs, id);
  }

  get(id: string): MeetingSession | undefined {
    const row = this.db.sqlite.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as
      | {
          id: string;
          title: string;
          status: "active" | "completed";
          platform: string | null;
          started_at: string;
          ended_at: string | null;
          participants_json: string;
          transcript_json: string;
          notes_json: string | null;
          calendar_event_id: string | null;
          duration_ms: number | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      platform: row.platform ?? undefined,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      participants: parseJson<MeetingParticipant[]>(row.participants_json, []),
      transcriptSegments: parseJson<TranscriptSegment[]>(row.transcript_json, []),
      notes: parseJson<MeetingNotes | undefined>(row.notes_json, undefined),
      calendarEventId: row.calendar_event_id ?? undefined,
      durationMs: row.duration_ms ?? undefined
    };
  }

  list() {
    const rows = this.db.sqlite
      .prepare(`SELECT id FROM meetings ORDER BY started_at DESC`)
      .all() as Array<{ id: string }>;

    return rows
      .map((row) => this.get(row.id))
      .filter((session): session is MeetingSession => Boolean(session));
  }
}
