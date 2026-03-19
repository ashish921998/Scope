import type { IntegrationProvider, MeetingPermissions, MeetingSession, ProviderKeyName } from "@scope/types";

declare global {
  interface Window {
    scope?: {
      connectIntegration: (provider: IntegrationProvider) => Promise<unknown>;
      startCapture: (sessionId: string, micDeviceId: string, systemAudio?: boolean) => Promise<unknown>;
      stopCapture: (sessionId: string) => Promise<unknown>;
      startMeetingCapture: (meetingId: string, micDeviceId: string, systemAudio?: boolean) => Promise<unknown>;
      stopMeetingCapture: (meetingId: string) => Promise<unknown>;
      getMeetingPermissions: () => Promise<MeetingPermissions>;
      openMeetingPermissionsSettings: () => Promise<unknown>;
      listRecentMeetings: () => Promise<MeetingSession[]>;
      startMeeting: (input: { consentAccepted: boolean; title?: string }) => Promise<MeetingSession>;
      getMeeting: (meetingId: string) => Promise<MeetingSession>;
      saveProviderKey: (provider: ProviderKeyName, keyRef: string) => Promise<unknown>;
      generateDossier: (featureId: string) => Promise<unknown>;
      exportDossier: (featureId: string, format: "markdown" | "json") => Promise<unknown>;
      getServiceToken: () => Promise<string>;
    };
  }
}

export {};
