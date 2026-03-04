import { ipcMain } from "electron";
import type { IntegrationProvider } from "@scope/types";
import { connectIntegrationOAuth } from "../auth/oauth";
import type { CaptureService } from "../audio/captureService";
import type { KeychainStore } from "../security/keychain";

export const registerIpcHandlers = (params: {
  captureService: CaptureService;
  keychainStore: KeychainStore;
  servicePort: number;
}) => {
  const baseUrl = `http://127.0.0.1:${params.servicePort}`;

  ipcMain.handle("auth/connectIntegration", async (_event, provider: IntegrationProvider) => {
    const result = await connectIntegrationOAuth(provider);
    return result;
  });

  ipcMain.handle(
    "audio/startCapture",
    async (_event, sessionId: string, micDeviceId: string, systemAudio = true) =>
      params.captureService.startCapture(sessionId, micDeviceId, systemAudio)
  );

  ipcMain.handle("audio/stopCapture", async (_event, sessionId: string) =>
    params.captureService.stopCapture(sessionId)
  );

  ipcMain.handle(
    "keys/saveProviderKey",
    async (_event, provider: "openai" | "anthropic", keyRef: string) => {
      await params.keychainStore.saveProviderKey(provider, keyRef);
      return { ok: true };
    }
  );

  ipcMain.handle("dossier/generate", async (_event, featureId: string) => {
    const response = await fetch(`${baseUrl}/v1/dossiers/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureId })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  });

  ipcMain.handle("export/dossier", async (_event, featureId: string, format: "markdown" | "json") => {
    const generateResponse = await fetch(`${baseUrl}/v1/dossiers/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureId })
    });

    if (!generateResponse.ok) {
      throw new Error(await generateResponse.text());
    }

    const dossier = (await generateResponse.json()) as { id: string };

    const exportResponse = await fetch(`${baseUrl}/v1/export/dossier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        featureId,
        dossierId: dossier.id,
        format
      })
    });

    if (!exportResponse.ok) {
      throw new Error(await exportResponse.text());
    }

    return exportResponse.json();
  });
};
