interface CaptureSession {
  sessionId: string;
  micDeviceId: string;
  systemAudio: boolean;
  startedAt: string;
}

export class CaptureService {
  private readonly active = new Map<string, CaptureSession>();
  constructor(private readonly localServiceBaseUrl: string) {}

  async startCapture(sessionId: string, micDeviceId: string, systemAudio = true) {
    const response = await fetch(`${this.localServiceBaseUrl}/v1/interviews/${encodeURIComponent(sessionId)}/transcription/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sampleRateHz: 24000
      })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const transcription = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    // micDeviceId and systemAudio are returned to the renderer so it can
    // apply them when setting up getUserMedia / getDisplayMedia constraints.
    // The main process does not route audio devices directly.
    const session: CaptureSession = {
      sessionId,
      micDeviceId,
      systemAudio,
      startedAt: new Date().toISOString()
    };

    this.active.set(sessionId, session);

    return {
      ok: true,
      mode: "local-dual-capture",
      ...session,
      transcription
    };
  }

  async stopCapture(sessionId: string) {
    const existing = this.active.get(sessionId);
    this.active.delete(sessionId);
    const response = await fetch(`${this.localServiceBaseUrl}/v1/interviews/${encodeURIComponent(sessionId)}/transcription/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
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
