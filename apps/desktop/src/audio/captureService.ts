import type { AudioChunkSource } from "@scope/types";
import { startNativeCaptureSession, type NativeCaptureChunkEvent, type NativeCaptureSession } from "./nativeCapture";

interface CaptureSession {
  sessionId: string;
  micDeviceId: string;
  systemAudio: boolean;
  startedAt: string;
  nativeSession: NativeCaptureSession | null;
  pendingUploads: Set<Promise<void>>;
  stopPromise: Promise<unknown> | null;
}

export class CaptureService {
  private readonly active = new Map<string, CaptureSession>();
  constructor(
    private readonly localServiceBaseUrl: string,
    private readonly serviceToken: string,
    private readonly nativeCaptureStarter: typeof startNativeCaptureSession = startNativeCaptureSession
  ) {}

  private serviceHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.serviceToken}`
    };
  }

  private async postChunk(sessionId: string, chunk: NativeCaptureChunkEvent) {
    const response = await fetch(`${this.localServiceBaseUrl}/v1/interviews/${encodeURIComponent(sessionId)}/transcription/chunk`, {
      method: "POST",
      headers: this.serviceHeaders(),
      body: JSON.stringify({
        audioBase64: chunk.audioBase64,
        source: chunk.source as AudioChunkSource,
        sampleRateHz: 24000,
        timestampMs: chunk.timestampMs
      })
    });
    if (!response.ok) {
      throw new Error(await response.text().catch(() => response.statusText));
    }
  }

  private bindNativeCapture(session: CaptureSession) {
    if (!session.nativeSession) {
      return;
    }

    session.nativeSession.on("chunk", (chunk: NativeCaptureChunkEvent) => {
      const upload = this.postChunk(session.sessionId, chunk).finally(() => {
        session.pendingUploads.delete(upload);
      });
      session.pendingUploads.add(upload);
    });

    session.nativeSession.on("fatal", () => {
      void this.stopCapture(session.sessionId).catch(() => {});
    });
  }

  async startCapture(sessionId: string, micDeviceId: string, systemAudio = true) {
    const response = await fetch(`${this.localServiceBaseUrl}/v1/interviews/${encodeURIComponent(sessionId)}/transcription/start`, {
      method: "POST",
      headers: this.serviceHeaders(),
      body: JSON.stringify({
        sampleRateHz: 24000
      })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const transcription = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    const nativeSession =
      process.platform === "darwin"
        ? await this.nativeCaptureStarter({
            sessionId,
            micDeviceId,
            includeSystemAudio: systemAudio,
            chunkDurationMs: 500
          })
        : null;

    const session: CaptureSession = {
      sessionId,
      micDeviceId,
      systemAudio,
      startedAt: new Date().toISOString(),
      nativeSession,
      pendingUploads: new Set(),
      stopPromise: null
    };

    this.bindNativeCapture(session);
    this.active.set(sessionId, session);

    return {
      ok: true,
      mode: nativeSession ? "native-dual-capture" : "browser-fallback",
      sessionId,
      micDeviceId,
      systemAudio,
      startedAt: session.startedAt,
      helperPath: nativeSession?.resolvedHelperPath ?? null,
      transcription
    };
  }

  async stopCapture(sessionId: string) {
    const existing = this.active.get(sessionId);
    if (existing?.stopPromise) {
      return existing.stopPromise;
    }

    if (!existing) {
      return {
        ok: true,
        stopped: false,
        sessionId,
        stoppedAt: new Date().toISOString(),
        transcription: null
      };
    }

    existing.stopPromise = (async () => {
      this.active.delete(sessionId);
      await existing.nativeSession?.stop();
      await Promise.allSettled([...existing.pendingUploads]);

      const response = await fetch(`${this.localServiceBaseUrl}/v1/interviews/${encodeURIComponent(sessionId)}/transcription/stop`, {
        method: "POST",
        headers: this.serviceHeaders(),
        body: JSON.stringify({})
      });
      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to stop transcription: ${text}`);
      }
      const transcription = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      return {
        ok: true,
        stopped: true,
        sessionId,
        stoppedAt: new Date().toISOString(),
        transcription
      };
    })();

    return existing.stopPromise;
  }
}
