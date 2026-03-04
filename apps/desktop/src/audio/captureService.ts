interface CaptureSession {
  sessionId: string;
  micDeviceId: string;
  systemAudio: boolean;
  startedAt: string;
}

export class CaptureService {
  private readonly active = new Map<string, CaptureSession>();

  startCapture(sessionId: string, micDeviceId: string, systemAudio = true) {
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
      ...session
    };
  }

  stopCapture(sessionId: string) {
    const existing = this.active.get(sessionId);
    this.active.delete(sessionId);

    return {
      ok: true,
      stopped: Boolean(existing),
      sessionId,
      stoppedAt: new Date().toISOString()
    };
  }
}
