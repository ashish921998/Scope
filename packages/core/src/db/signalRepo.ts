import type { EvidenceRef, Signal } from "@scope/types";
import type { ScopeDb } from "./client";

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  return JSON.parse(value) as T;
};

export class SignalRepo {
  constructor(private readonly db: ScopeDb) {}

  save(signal: Signal, fingerprint: string) {
    const trx = this.db.sqlite.transaction(() => {
      this.db.sqlite
        .prepare(
          `INSERT INTO signals(id, source, source_ref, type, confidence, summary, created_at, metadata_json, fingerprint)
           VALUES (@id, @source, @sourceRef, @type, @confidence, @summary, @createdAt, @metadataJson, @fingerprint)
           ON CONFLICT(id) DO UPDATE SET type = excluded.type, confidence = excluded.confidence, summary = excluded.summary`
        )
        .run({
          id: signal.id,
          source: signal.source,
          sourceRef: signal.sourceRef,
          type: signal.type,
          confidence: signal.confidence,
          summary: signal.summary,
          createdAt: signal.createdAt,
          metadataJson: signal.metadata ? JSON.stringify(signal.metadata) : null,
          fingerprint
        });

      this.db.sqlite.prepare(`INSERT INTO signals_fts(id, summary) VALUES (?, ?)`).run(signal.id, signal.summary);

      const insertEvidence = this.db.sqlite.prepare(
        `INSERT OR REPLACE INTO evidence_refs(id, signal_id, kind, uri, quote, timestamp_ms)
         VALUES (@id, @signalId, @kind, @uri, @quote, @timestampMs)`
      );

      for (const evidence of signal.evidenceRefs) {
        insertEvidence.run({
          id: evidence.id,
          signalId: signal.id,
          kind: evidence.kind,
          uri: evidence.uri,
          quote: evidence.quote,
          timestampMs: evidence.timestampMs ?? null
        });
      }
    });

    trx();

    return signal;
  }

  findBySourceRef(source: string, sourceRef: string) {
    const row = this.db.sqlite
      .prepare(`SELECT id FROM signals WHERE source = ? AND source_ref = ?`)
      .get(source, sourceRef) as { id: string } | undefined;

    return row?.id;
  }

  findByFingerprint(fingerprint: string): Signal | undefined {
    const row = this.db.sqlite.prepare(`SELECT * FROM signals WHERE fingerprint = ?`).get(fingerprint) as
      | {
          id: string;
          source: Signal["source"];
          source_ref: string;
          type: Signal["type"];
          confidence: number;
          summary: string;
          created_at: string;
          metadata_json: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return this.hydrateSignal(row);
  }

  list(limit = 200): Signal[] {
    const rows = this.db.sqlite
      .prepare(`SELECT * FROM signals ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Array<{
      id: string;
      source: Signal["source"];
      source_ref: string;
      type: Signal["type"];
      confidence: number;
      summary: string;
      created_at: string;
      metadata_json: string | null;
    }>;

    return rows.map((row) => this.hydrateSignal(row));
  }

  listByIds(ids: string[]): Signal[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.db.sqlite
      .prepare(`SELECT * FROM signals WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{
      id: string;
      source: Signal["source"];
      source_ref: string;
      type: Signal["type"];
      confidence: number;
      summary: string;
      created_at: string;
      metadata_json: string | null;
    }>;

    return rows.map((row) => this.hydrateSignal(row));
  }

  private hydrateSignal(row: {
    id: string;
    source: Signal["source"];
    source_ref: string;
    type: Signal["type"];
    confidence: number;
    summary: string;
    created_at: string;
    metadata_json: string | null;
  }): Signal {
    const evidence = this.db.sqlite
      .prepare(`SELECT * FROM evidence_refs WHERE signal_id = ?`)
      .all(row.id) as Array<{
      id: string;
      signal_id: string;
      kind: EvidenceRef["kind"];
      uri: string;
      quote: string;
      timestamp_ms: number | null;
    }>;

    return {
      id: row.id,
      source: row.source,
      sourceRef: row.source_ref,
      type: row.type,
      confidence: row.confidence,
      summary: row.summary,
      createdAt: row.created_at,
      metadata: parseJson(row.metadata_json, undefined),
      evidenceRefs: evidence.map((item) => ({
        id: item.id,
        signalId: item.signal_id,
        kind: item.kind,
        uri: item.uri,
        quote: item.quote,
        timestampMs: item.timestamp_ms ?? undefined
      }))
    };
  }
}
