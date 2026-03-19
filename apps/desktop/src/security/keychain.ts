import keytar from "keytar";
import { randomBytes } from "node:crypto";
import type { IntegrationProvider } from "@scope/types";

const SERVICE = "com.scope.desktop";
const DB_KEY_ACCOUNT = "db:local-encryption-key";

export interface IntegrationTokenSecret {
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  metadata?: Record<string, unknown>;
}

export class KeychainStore {
  async saveProviderKey(provider: "openai" | "anthropic", key: string) {
    await keytar.setPassword(SERVICE, `provider:${provider}`, key);
  }

  async getProviderKey(provider: "openai" | "anthropic") {
    return keytar.getPassword(SERVICE, `provider:${provider}`);
  }

  async saveIntegrationToken(token: IntegrationTokenSecret) {
    await keytar.setPassword(SERVICE, `integration:${token.provider}`, JSON.stringify(token));
  }

  async getIntegrationToken(provider: IntegrationProvider): Promise<IntegrationTokenSecret | null> {
    const raw = await keytar.getPassword(SERVICE, `integration:${provider}`);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as IntegrationTokenSecret;
    } catch {
      return null;
    }
  }

  async saveDatabaseKey(key: string) {
    await keytar.setPassword(SERVICE, DB_KEY_ACCOUNT, key);
  }

  async getDatabaseKey() {
    return keytar.getPassword(SERVICE, DB_KEY_ACCOUNT);
  }

  async getOrCreateDatabaseKey() {
    const existing = await this.getDatabaseKey();
    if (existing) {
      return existing;
    }

    const generated = randomBytes(32).toString("hex");
    await this.saveDatabaseKey(generated);
    return generated;
  }

  async deleteProviderKey(provider: "openai" | "anthropic") {
    await keytar.deletePassword(SERVICE, `provider:${provider}`);
  }

  async deleteIntegrationToken(provider: IntegrationProvider) {
    await keytar.deletePassword(SERVICE, `integration:${provider}`);
  }
}
