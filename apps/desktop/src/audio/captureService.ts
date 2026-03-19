interface CaptureSession {
  sessionId: string;
  micDeviceId: string;
  systemAudio: boolean;
  startedAt: string;
  kind: "interview" | "meeting";
}

export class CaptureService {
  private readonly active = new Map<string, CaptureSession>();
  constructor(
    private readonly localServiceBaseUrl: string,
    private readonly serviceToken: string
  ) {}

  private serviceHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.serviceToken}`
    };
  }

  async startCapture(sessionId: string, micDeviceId: string, systemAudio = true) {
    return this.startSession("interview", sessionId, micDeviceId, systemAudio);
  }

  async stopCapture(sessionId: string) {
    return this.stopSession("interview", sessionId);
  }

  async startMeetingCapture(sessionId: string, micDeviceId: string, systemAudio = true) {
    return this.startSession("meeting", sessionId, micDeviceId, systemAudio);
  }

  async stopMeetingCapture(sessionId: string) {
    return this.stopSession("meeting", sessionId);
  }

  private async startSession(kind: "interview" | "meeting", sessionId: string, micDeviceId: string, systemAudio: boolean) {
    const response = await fetch(
      `${this.localServiceBaseUrl}/v1/${kind === "meeting" ? "meetings" : "interviews"}/${encodeURIComponent(sessionId)}/transcription/start`,
      {
        method: "POST",
        headers: this.serviceHeaders(),
        body: JSON.stringify({
          sampleRateHz: 24000
        })
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const transcription = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    const session: CaptureSession = {
      sessionId,
      micDeviceId,
      systemAudio,
      startedAt: new Date().toISOString(),
      kind
    };

    this.active.set(sessionId, session);

    return {
      ok: true,
      mode: "local-dual-capture",
      ...session,
      transcription
    };
  }

  private async stopSession(kind: "interview" | "meeting", sessionId: string) {
    const existing = this.active.get(sessionId);
    this.active.delete(sessionId);
    const response = await fetch(
      `${this.localServiceBaseUrl}/v1/${kind === "meeting" ? "meetings" : "interviews"}/${encodeURIComponent(sessionId)}/transcription/stop`,
      {
        method: "POST",
        headers: this.serviceHeaders(),
        body: JSON.stringify({})
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to stop transcription: ${text}`);
    }
    const transcription = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    return {
      ok: true,
      stopped: Boolean(existing),
      sessionId,
      stoppedAt: new Date().toISOString(),
      transcription
    };
  }
}
