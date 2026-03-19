import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { IntegrationProvider, ProviderKeyName } from "@scope/types";
import { connectIntegrationOAuth } from "../auth/oauth";
import type { CaptureService } from "../audio/captureService";
import { getMeetingPermissions, openMeetingPermissionsSettings } from "../permissions/mediaPermissions";
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

const KEY_PROVIDERS = new Set<ProviderKeyName>(["openai", "anthropic"]);
const EXPORT_FORMATS = new Set(["markdown", "json"]);

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

  ipcMain.handle("meeting/getPermissions", (event) => {
    assertTrustedSender(event, params.rendererUrl);
    return getMeetingPermissions();
  });

  ipcMain.handle("meeting/openPermissionsSettings", async (event) => {
    assertTrustedSender(event, params.rendererUrl);
    return openMeetingPermissionsSettings();
  });

  ipcMain.handle("meeting/listRecent", async (event) => {
    assertTrustedSender(event, params.rendererUrl);
    const response = await fetch(`${baseUrl}/v1/meetings`, {
      headers: { Authorization: `Bearer ${params.serviceToken}` }
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const payload = (await response.json()) as { items?: unknown[] };
    return payload.items ?? [];
  });

  ipcMain.handle("meeting/start", async (event, input: unknown) => {
    assertTrustedSender(event, params.rendererUrl);
    const body = typeof input === "object" && input ? input : {};
    const response = await fetch(`${baseUrl}/v1/meetings/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.serviceToken}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  });

  ipcMain.handle("meeting/get", async (event, meetingId: unknown) => {
    assertTrustedSender(event, params.rendererUrl);
    const safeMeetingId = ensureString(meetingId, "meetingId");
    const response = await fetch(`${baseUrl}/v1/meetings/${encodeURIComponent(safeMeetingId)}`, {
      headers: { Authorization: `Bearer ${params.serviceToken}` }
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  });

  ipcMain.handle(
    "meeting/startCapture",
    async (event, meetingId: unknown, micDeviceId: unknown, systemAudio = true) => {
      assertTrustedSender(event, params.rendererUrl);
      const safeMeetingId = ensureString(meetingId, "meetingId");
      const safeMicDeviceId = ensureString(micDeviceId, "micDeviceId");
      return params.captureService.startMeetingCapture(safeMeetingId, safeMicDeviceId, Boolean(systemAudio));
    }
  );

  ipcMain.handle("meeting/stopCapture", async (event, meetingId: unknown) => {
    assertTrustedSender(event, params.rendererUrl);
    const safeMeetingId = ensureString(meetingId, "meetingId");
    return params.captureService.stopMeetingCapture(safeMeetingId);
  });

  ipcMain.handle(
    "keys/saveProviderKey",
    async (event, provider: unknown, keyRef: unknown) => {
      assertTrustedSender(event, params.rendererUrl);
      const keyProvider = ensureString(provider, "provider") as ProviderKeyName;
      if (!KEY_PROVIDERS.has(keyProvider)) {
        throw new Error(`Unsupported key provider: ${keyProvider}`);
      }

      const secret = ensureString(keyRef, "keyRef");
      await params.keychainStore.saveProviderKey(keyProvider as ProviderKeyName, secret);
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
