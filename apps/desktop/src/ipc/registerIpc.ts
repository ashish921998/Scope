import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { IntegrationProvider, ProviderKeyName } from "@scope/types";
import { connectIntegrationOAuth } from "../auth/oauth";
import type { CaptureService } from "../audio/captureService";
import type { KeychainStore } from "../security/keychain";

const PROVIDERS: ReadonlySet<IntegrationProvider> = new Set([
  "slack",
  "linear",
  "github",
  "posthog",
  "notion",
  "jira",
  "google"
]);

const KEY_PROVIDERS: ReadonlySet<ProviderKeyName> = new Set(["openai", "anthropic", "deepgram"]);
const EXPORT_FORMATS = new Set(["markdown", "json"]);

const isProviderKeyName = (value: string): value is ProviderKeyName => KEY_PROVIDERS.has(value as ProviderKeyName);

const ensureString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
};

const isTrustedSender = (event: IpcMainInvokeEvent, rendererUrl: string) => {
  try {
    const senderFrameUrl = event.senderFrame?.url;
    if (!senderFrameUrl) {
      return false;
    }

    const senderUrl = new URL(senderFrameUrl);
    const expected = new URL(rendererUrl);

    if (expected.protocol === "file:") {
      return senderUrl.protocol === "file:";
    }

    return senderUrl.origin === expected.origin;
  } catch {
    return false;
  }
};

const assertTrustedSender = (event: IpcMainInvokeEvent, rendererUrl: string) => {
  if (!isTrustedSender(event, rendererUrl)) {
    throw new Error("Blocked IPC call from untrusted renderer frame.");
  }
};

export const registerIpcHandlers = (params: {
  captureService: CaptureService;
  keychainStore: KeychainStore;
  servicePort: number;
  serviceToken: string;
  rendererUrl: string;
}) => {
  const baseUrl = `http://127.0.0.1:${params.servicePort}`;

  ipcMain.handle("service/getToken", (event) => {
    assertTrustedSender(event, params.rendererUrl);
    return params.serviceToken;
  });

  ipcMain.handle("auth/connectIntegration", async (event, provider: unknown) => {
    assertTrustedSender(event, params.rendererUrl);
    const integrationProvider = ensureString(provider, "provider") as IntegrationProvider;
    if (!PROVIDERS.has(integrationProvider)) {
      throw new Error(`Unsupported integration provider: ${integrationProvider}`);
    }

    const result = await connectIntegrationOAuth(integrationProvider);
    if (result.mode === "oauth") {
      await params.keychainStore.saveIntegrationToken(result.token);
      return {
        provider: result.provider,
        mode: result.mode,
        scope: result.token.scope,
        expiresAt: result.token.expiresAt
      };
    }

    return result;
  });

  ipcMain.handle(
    "audio/startCapture",
    async (event, sessionId: unknown, micDeviceId: unknown, systemAudio = true) => {
      assertTrustedSender(event, params.rendererUrl);
      const safeSessionId = ensureString(sessionId, "sessionId");
      const safeMicDeviceId = ensureString(micDeviceId, "micDeviceId");
      return params.captureService.startCapture(safeSessionId, safeMicDeviceId, Boolean(systemAudio));
    }
  );

  ipcMain.handle("audio/stopCapture", async (event, sessionId: unknown) => {
    assertTrustedSender(event, params.rendererUrl);
    const safeSessionId = ensureString(sessionId, "sessionId");
    return params.captureService.stopCapture(safeSessionId);
  });

  ipcMain.handle(
    "keys/saveProviderKey",
    async (event, provider: unknown, keyRef: unknown) => {
      assertTrustedSender(event, params.rendererUrl);
      const keyProvider = ensureString(provider, "provider");
      if (!isProviderKeyName(keyProvider)) {
        throw new Error(`Unsupported key provider: ${keyProvider}`);
      }

      const secret = ensureString(keyRef, "keyRef");
      await params.keychainStore.saveProviderKey(keyProvider, secret);
      return { ok: true };
    }
  );

  ipcMain.handle("dossier/generate", async (event, featureId: unknown) => {
    assertTrustedSender(event, params.rendererUrl);
    const safeFeatureId = ensureString(featureId, "featureId");

    const response = await fetch(`${baseUrl}/v1/dossiers/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureId: safeFeatureId })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  });

  ipcMain.handle("export/dossier", async (event, featureId: unknown, format: unknown) => {
    assertTrustedSender(event, params.rendererUrl);
    const safeFeatureId = ensureString(featureId, "featureId");
    const safeFormat = ensureString(format, "format");
    if (!EXPORT_FORMATS.has(safeFormat)) {
      throw new Error(`Unsupported export format: ${safeFormat}`);
    }

    const generateResponse = await fetch(`${baseUrl}/v1/dossiers/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureId: safeFeatureId })
    });

    if (!generateResponse.ok) {
      throw new Error(await generateResponse.text());
    }

    const dossier = (await generateResponse.json()) as { id: string };

    const exportResponse = await fetch(`${baseUrl}/v1/export/dossier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        featureId: safeFeatureId,
        dossierId: dossier.id,
        format: safeFormat
      })
    });

    if (!exportResponse.ok) {
      throw new Error(await exportResponse.text());
    }

    return exportResponse.json();
  });
};
