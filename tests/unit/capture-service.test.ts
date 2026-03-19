import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeCaptureChunkEvent } from "../../apps/desktop/src/audio/nativeCapture";
import { CaptureService } from "../../apps/desktop/src/audio/captureService";

class FakeNativeCaptureSession extends EventEmitter {
  stop = vi.fn(async () => {});
  resolvedHelperPath = "/tmp/ScopeAudioCapture";

  emitChunk(chunk: NativeCaptureChunkEvent) {
    this.emit("chunk", chunk);
  }
}

describe("CaptureService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards native chunks with source metadata and auth", async () => {
    const nativeSession = new FakeNativeCaptureSession();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ started: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stopped: true }), { status: 200 }));

    const service = new CaptureService("http://127.0.0.1:4010", "service-token", async () => nativeSession as never);
    await service.startCapture("session-1", "default", true);

    nativeSession.emitChunk({
      type: "chunk",
      source: "mic",
      audioBase64: "AQID",
      frames: 12,
      timestampMs: 123
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await service.stopCapture("session-1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const chunkRequest = fetchMock.mock.calls[1];
    expect(chunkRequest[0]).toBe("http://127.0.0.1:4010/v1/interviews/session-1/transcription/chunk");
    expect(chunkRequest[1]?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer service-token"
    });
    expect(JSON.parse(String(chunkRequest[1]?.body))).toMatchObject({
      audioBase64: "AQID",
      source: "mic",
      sampleRateHz: 24000,
      timestampMs: 123
    });
  });

  it("waits for in-flight chunk uploads before stopping transcription", async () => {
    const nativeSession = new FakeNativeCaptureSession();
    let resolveChunkUpload: (() => void) | null = null;
    const stopResponse = new Response(JSON.stringify({ stopped: true }), { status: 200 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/transcription/start")) {
        return new Response(JSON.stringify({ started: true }), { status: 200 });
      }
      if (url.endsWith("/transcription/chunk")) {
        await new Promise<void>((resolve) => {
          resolveChunkUpload = resolve;
        });
        return new Response(JSON.stringify({ accepted: true }), { status: 202 });
      }
      return stopResponse;
    });

    const service = new CaptureService("http://127.0.0.1:4010", "service-token", async () => nativeSession as never);
    await service.startCapture("session-2", "default", true);

    nativeSession.emitChunk({
      type: "chunk",
      source: "system",
      audioBase64: "BAUG",
      frames: 8,
      timestampMs: 456
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const stopPromise = service.stopCapture("session-2");

    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/transcription/stop"))).toBe(false);

    resolveChunkUpload?.();
    await stopPromise;

    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("http://127.0.0.1:4010/v1/interviews/session-2/transcription/stop");
  });
});
