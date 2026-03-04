import type { FeatureDossier } from "@scope/types";
import type { ScopeDb } from "./client";

export class DossierRepo {
  constructor(private readonly db: ScopeDb) {}

  save(dossier: FeatureDossier) {
    this.db.sqlite
      .prepare(
        `INSERT OR REPLACE INTO dossiers(id, feature_id, sections_json, citations_json, critic_notes_json, version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dossier.id,
        dossier.featureId,
        JSON.stringify(dossier.sections9),
        JSON.stringify(dossier.citations),
        JSON.stringify(dossier.criticNotes),
        dossier.version,
        dossier.createdAt
      );

    return dossier;
  }

  get(id: string): FeatureDossier | undefined {
    const row = this.db.sqlite.prepare(`SELECT * FROM dossiers WHERE id = ?`).get(id) as
      | {
          id: string;
          feature_id: string;
          sections_json: string;
          citations_json: string;
          critic_notes_json: string;
          version: number;
          created_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      featureId: row.feature_id,
      sections9: JSON.parse(row.sections_json),
      citations: JSON.parse(row.citations_json),
      criticNotes: JSON.parse(row.critic_notes_json),
      version: row.version,
      createdAt: row.created_at
    };
  }
}
