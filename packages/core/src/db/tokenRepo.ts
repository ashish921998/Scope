import type { IntegrationProvider } from "@scope/types";
import type { ScopeDb } from "./client";

export interface IntegrationToken {
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  metadata?: Record<string, unknown>;
}

export class TokenRepo {
  constructor(private readonly db: ScopeDb) {}

  save(token: IntegrationToken) {
    this.db.sqlite
      .prepare(
        `INSERT OR REPLACE INTO integration_tokens(provider, access_token, refresh_token, expires_at, scope, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        token.provider,
        token.accessToken,
        token.refreshToken ?? null,
        token.expiresAt ?? null,
        token.scope ?? null,
        token.metadata ? JSON.stringify(token.metadata) : null
      );
  }

  get(provider: IntegrationProvider): IntegrationToken | undefined {
    const row = this.db.sqlite.prepare(`SELECT * FROM integration_tokens WHERE provider = ?`).get(provider) as
      | {
          provider: IntegrationProvider;
          access_token: string;
          refresh_token: string | null;
          expires_at: string | null;
          scope: string | null;
          metadata_json: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      provider: row.provider,
      accessToken: row.access_token,
      refreshToken: row.refresh_token ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      scope: row.scope ?? undefined,
      metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : undefined
    };
  }
}
