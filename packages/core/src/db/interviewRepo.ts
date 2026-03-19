import type { InterviewDebrief, InterviewSession, TranscriptSegment } from "@scope/types";
import type { ScopeDb } from "./client";
import { parseJson } from "./parseJson";

export class InterviewRepo {
  constructor(private readonly db: ScopeDb) {}

  create(session: InterviewSession) {
    this.db.sqlite
      .prepare(
        `INSERT INTO interviews(id, status, consent_accepted, started_at, transcript_json, followups_json)
         VALUES (@id, @status, @consentAccepted, @startedAt, @transcriptJson, @followupsJson)`
      )
      .run({
        id: session.id,
        status: session.status,
        consentAccepted: session.consentAccepted ? 1 : 0,
        startedAt: session.startedAt,
        transcriptJson: JSON.stringify(session.transcriptSegments),
        followupsJson: JSON.stringify(session.followups)
      });
    return session;
  }

  updateTranscript(id: string, transcriptSegments: TranscriptSegment[], followups: string[]) {
    this.db.sqlite
      .prepare(`UPDATE interviews SET transcript_json = ?, followups_json = ? WHERE id = ?`)
      .run(JSON.stringify(transcriptSegments), JSON.stringify(followups), id);
  }

  complete(id: string, debrief: InterviewDebrief, endedAt: string) {
    this.db.sqlite
      .prepare(`UPDATE interviews SET status = 'completed', debrief_json = ?, ended_at = ? WHERE id = ?`)
      .run(JSON.stringify(debrief), endedAt, id);
  }

  get(id: string): InterviewSession | undefined {
    const row = this.db.sqlite.prepare(`SELECT * FROM interviews WHERE id = ?`).get(id) as
      | {
          id: string;
          status: "active" | "completed";
          consent_accepted: number;
          started_at: string;
          ended_at: string | null;
          transcript_json: string;
          followups_json: string;
          debrief_json: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      status: row.status,
      consentAccepted: row.consent_accepted === 1,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      transcriptSegments: parseJson(row.transcript_json, []),
      followups: parseJson(row.followups_json, []),
      debrief: parseJson(row.debrief_json, undefined)
    };
  }
}
