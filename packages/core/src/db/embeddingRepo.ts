import type { ScopeDb } from "./client";

export interface EmbeddingRow {
  id: string;
  signalId: string;
  vector: number[];
  model: string;
}

export class EmbeddingRepo {
  constructor(private readonly db: ScopeDb) {}

  save(row: EmbeddingRow) {
    this.db.sqlite
      .prepare(`INSERT OR REPLACE INTO embeddings(id, signal_id, vector_json, model) VALUES (?, ?, ?, ?)`)
      .run(row.id, row.signalId, JSON.stringify(row.vector), row.model);
  }

  listBySignalIds(signalIds: string[]) {
    if (signalIds.length === 0) {
      return [] as EmbeddingRow[];
    }

    const placeholders = signalIds.map(() => "?").join(", ");
    const rows = this.db.sqlite
      .prepare(`SELECT * FROM embeddings WHERE signal_id IN (${placeholders})`)
      .all(...signalIds) as Array<{
      id: string;
      signal_id: string;
      vector_json: string;
      model: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      signalId: row.signal_id,
      vector: JSON.parse(row.vector_json),
      model: row.model
    }));
  }
}
