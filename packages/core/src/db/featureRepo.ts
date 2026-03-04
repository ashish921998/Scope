import type { FeatureCandidate } from "@scope/types";
import type { ScopeDb } from "./client";

export class FeatureRepo {
  constructor(private readonly db: ScopeDb) {}

  save(candidate: FeatureCandidate) {
    this.db.sqlite
      .prepare(
        `INSERT OR REPLACE INTO feature_candidates(id, title, signal_ids_json, cluster_score, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        candidate.id,
        candidate.title,
        JSON.stringify(candidate.signalIds),
        candidate.clusterScore,
        candidate.status,
        candidate.createdAt
      );

    return candidate;
  }

  list(status?: FeatureCandidate["status"]) {
    const rows = (status
      ? this.db.sqlite
          .prepare(`SELECT * FROM feature_candidates WHERE status = ? ORDER BY created_at DESC`)
          .all(status)
      : this.db.sqlite.prepare(`SELECT * FROM feature_candidates ORDER BY created_at DESC`).all()) as Array<{
      id: string;
      title: string;
      signal_ids_json: string;
      cluster_score: number;
      status: FeatureCandidate["status"];
      created_at: string;
    }>;

    return rows.map((row) => {
      return {
        id: row.id,
        title: row.title,
        signalIds: JSON.parse(row.signal_ids_json) as string[],
        clusterScore: row.cluster_score,
        status: row.status,
        createdAt: row.created_at
      } as FeatureCandidate;
    });
  }
}
