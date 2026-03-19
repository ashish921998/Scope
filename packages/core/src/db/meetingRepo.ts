import type { MeetingNotes, MeetingSession, MeetingTranscriptSegment } from "@scope/types";
import type { ScopeDb } from "./client";
import { parseJson } from "./parseJson";

export class MeetingRepo {
  constructor(private readonly db: ScopeDb) {}

  create(session: MeetingSession) {
    this.db.sqlite
      .prepare(
        `INSERT INTO meetings(id, title, status, consent_accepted, started_at, transcript_json, notes_json)
         VALUES (@id, @title, @status, @consentAccepted, @startedAt, @transcriptJson, @notesJson)`
      )
      .run({
        id: session.id,
        title: session.title,
        status: session.status,
        consentAccepted: session.consentAccepted ? 1 : 0,
        startedAt: session.startedAt,
        transcriptJson: JSON.stringify(session.transcriptSegments),
        notesJson: session.notes ? JSON.stringify(session.notes) : null
      });
    return session;
  }

  updateTranscript(id: string, transcriptSegments: MeetingTranscriptSegment[]) {
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
          title: string;
          status: "active" | "completed";
          consent_accepted: number;
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
      title: row.title,
      status: row.status,
      consentAccepted: row.consent_accepted === 1,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      transcriptSegments: parseJson(row.transcript_json, []),
      notes: parseJson(row.notes_json, undefined)
    };
  }

  listRecent(limit = 5): MeetingSession[] {
    const rows = this.db.sqlite
      .prepare(`SELECT * FROM meetings ORDER BY started_at DESC LIMIT ?`)
      .all(limit) as Array<{
      id: string;
      title: string;
      status: "active" | "completed";
      consent_accepted: number;
      started_at: string;
      ended_at: string | null;
      transcript_json: string;
      notes_json: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      consentAccepted: row.consent_accepted === 1,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      transcriptSegments: parseJson(row.transcript_json, []),
      notes: parseJson(row.notes_json, undefined)
    }));
  }
}
