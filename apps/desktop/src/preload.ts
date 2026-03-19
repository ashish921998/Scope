import { contextBridge, ipcRenderer } from "electron";
import type { IntegrationProvider, ProviderKeyName } from "@scope/types";

contextBridge.exposeInMainWorld("scope", {
  connectIntegration: (provider: IntegrationProvider) => ipcRenderer.invoke("auth/connectIntegration", provider),
  startCapture: (sessionId: string, micDeviceId: string, systemAudio = true) =>
    ipcRenderer.invoke("audio/startCapture", sessionId, micDeviceId, systemAudio),
  stopCapture: (sessionId: string) => ipcRenderer.invoke("audio/stopCapture", sessionId),
  saveProviderKey: (provider: ProviderKeyName, keyRef: string) =>
    ipcRenderer.invoke("keys/saveProviderKey", provider, keyRef),
  generateDossier: (featureId: string) => ipcRenderer.invoke("dossier/generate", featureId),
  exportDossier: (featureId: string, format: "markdown" | "json") =>
    ipcRenderer.invoke("export/dossier", featureId, format),
  getServiceToken: () => ipcRenderer.invoke("service/getToken")
});
