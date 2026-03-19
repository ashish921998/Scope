import type { MeetingNotes, MeetingSession, TranscriptSegment } from "@scope/types";
import type { ScopeDb } from "./client";
import { parseJson } from "./parseJson";

export class MeetingRepo {
  constructor(private readonly db: ScopeDb) {}

  create(session: MeetingSession) {
    this.db.sqlite
      .prepare(
        `INSERT INTO meetings(id, status, started_at, transcript_json, notes_json)
         VALUES (@id, @status, @startedAt, @transcriptJson, @notesJson)`
      )
      .run({
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
        transcriptJson: JSON.stringify(session.transcriptSegments),
        notesJson: session.notes ? JSON.stringify(session.notes) : null
      });
    return session;
  }

  updateTranscript(id: string, transcriptSegments: TranscriptSegment[]) {
    this.db.sqlite
      .prepare(`UPDATE meetings SET transcript_json = ? WHERE id = ?`)
      .run(JSON.stringify(transcriptSegments), id);
  }

  complete(id: string, notes: MeetingNotes, endedAt: string) {
    this.db.sqlite
      .prepare(`UPDATE meetings SET status = 'completed', notes_json = ?, ended_at = ? WHERE id = ?`)
      .run(JSON.stringify(notes), endedAt, id);
  }

  get(id: string): MeetingSession | undefined {
    const row = this.db.sqlite.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as
      | {
          id: string;
          status: "active" | "completed";
          started_at: string;
          ended_at: string | null;
          transcript_json: string;
          notes_json: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      transcriptSegments: parseJson(row.transcript_json, []),
      notes: parseJson(row.notes_json, undefined)
    };
  }

  list(): MeetingSession[] {
    const rows = this.db.sqlite
      .prepare(`SELECT * FROM meetings ORDER BY started_at DESC`)
      .all() as Array<{
      id: string;
      status: "active" | "completed";
      started_at: string;
      ended_at: string | null;
      transcript_json: string;
      notes_json: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      transcriptSegments: parseJson(row.transcript_json, []),
      notes: parseJson(row.notes_json, undefined)
    }));
  }
}
