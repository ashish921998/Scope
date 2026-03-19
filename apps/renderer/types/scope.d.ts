import type { IntegrationProvider } from "@scope/types";

declare global {
  interface Window {
    scope?: {
      connectIntegration: (provider: IntegrationProvider) => Promise<unknown>;
      startCapture: (sessionId: string, micDeviceId: string, systemAudio?: boolean) => Promise<unknown>;
      stopCapture: (sessionId: string) => Promise<unknown>;
      saveProviderKey: (provider: "openai" | "anthropic", keyRef: string) => Promise<unknown>;
      generateDossier: (featureId: string) => Promise<unknown>;
      exportDossier: (featureId: string, format: "markdown" | "json") => Promise<unknown>;
      getServiceToken: () => Promise<string>;
      getServiceBaseUrl: () => Promise<string>;
      getOverlayState: () => Promise<{
        interviewId: string;
        title: string;
        confidence: "low" | "medium" | "high";
        startedAt: string;
        visible: boolean;
      } | null>;
      stopOverlaySession: () => Promise<unknown>;
    };
  }
}

export {};
