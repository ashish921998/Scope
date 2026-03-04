import keytar from "keytar";
import type { IntegrationProvider } from "@scope/types";

const SERVICE = "scope-arena-equivalent";

export interface IntegrationTokenSecret {
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
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
    return JSON.parse(raw) as IntegrationTokenSecret;
  }
}
