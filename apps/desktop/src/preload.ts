import { contextBridge, ipcRenderer } from "electron";
import type { IntegrationProvider, MeetingPermissions, MeetingSession, ProviderKeyName } from "@scope/types";

contextBridge.exposeInMainWorld("scope", {
  connectIntegration: (provider: IntegrationProvider) => ipcRenderer.invoke("auth/connectIntegration", provider),
  startCapture: (sessionId: string, micDeviceId: string, systemAudio = true) =>
    ipcRenderer.invoke("audio/startCapture", sessionId, micDeviceId, systemAudio),
  stopCapture: (sessionId: string) => ipcRenderer.invoke("audio/stopCapture", sessionId),
  startMeetingCapture: (meetingId: string, micDeviceId: string, systemAudio = true) =>
    ipcRenderer.invoke("meeting/startCapture", meetingId, micDeviceId, systemAudio),
  stopMeetingCapture: (meetingId: string) => ipcRenderer.invoke("meeting/stopCapture", meetingId),
  getMeetingPermissions: () => ipcRenderer.invoke("meeting/getPermissions") as Promise<MeetingPermissions>,
  openMeetingPermissionsSettings: () => ipcRenderer.invoke("meeting/openPermissionsSettings"),
  listRecentMeetings: () => ipcRenderer.invoke("meeting/listRecent") as Promise<MeetingSession[]>,
  startMeeting: (input: { consentAccepted: boolean; title?: string }) =>
    ipcRenderer.invoke("meeting/start", input) as Promise<MeetingSession>,
  getMeeting: (meetingId: string) => ipcRenderer.invoke("meeting/get", meetingId) as Promise<MeetingSession>,
  saveProviderKey: (provider: ProviderKeyName, keyRef: string) =>
    ipcRenderer.invoke("keys/saveProviderKey", provider, keyRef),
  generateDossier: (featureId: string) => ipcRenderer.invoke("dossier/generate", featureId),
  exportDossier: (featureId: string, format: "markdown" | "json") =>
    ipcRenderer.invoke("export/dossier", featureId, format),
  getServiceToken: () => ipcRenderer.invoke("service/getToken")
});
