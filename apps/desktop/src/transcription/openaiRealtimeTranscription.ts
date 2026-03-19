import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import WebSocket, { type RawData } from "ws";
import type { AudioChunkSource, TranscriptSegment, TranscriptSpeaker } from "@scope/types";
import { assertAllowedEgress, safeFetch } from "@scope/core";

type Source = AudioChunkSource;
type Speaker = TranscriptSpeaker;

interface StartTranscriptionOptions {
  realtimeModel?: string;
  fallbackModel?: string;
  language?: string;
  sampleRateHz?: number;
}

interface AudioChunkInput {
  audioBase64: string;
  source?: Source;
  sampleRateHz?: number;
  timestampMs?: number;
}

interface StopTranscriptionResult {
  interviewId: string;
  realtimeEvents: number;
  transcriptSegmentsProduced: number;
  fallbackUsed: boolean;
}

interface TranscriptionSessionState {
  interviewId: string;
  ws: WebSocket | null;
  bufferedChunksBySource: Record<Source, Buffer[]>;
  sourceQueue: Source[];
  itemSource: Map<string, Source>;
  partialByItem: Map<string, string>;
  sampleRateHz: number;
  realtimeModel: string;
  fallbackModel: string;
  language?: string;
  realtimeEvents: number;
  transcriptSegmentsProduced: number;
  fallbackUsed: boolean;
  realtimeFailed: boolean;
  closed: boolean;
  isBufferCappedBySource: Record<Source, boolean>;
}

const DEFAULT_REALTIME_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_FALLBACK_MODEL = "whisper-1";
const DEFAULT_SAMPLE_RATE = 24000;

// Cap the fallback audio buffer to the last 10 minutes to prevent unbounded memory growth.
// At 24kHz PCM16 this is ~28.8 MB maximum.
const MAX_FALLBACK_CHUNKS_BYTES = 24000 * 2 * 600; // 10 min at 24kHz PCM16
const AUDIO_SOURCES: Source[] = ["mic", "system"];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const speakerForSource = (source: Source): Speaker => (source === "mic" ? "me" : "speaker_remote");

const safeJsonParse = (raw: string) => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const buildWavFromPcm16 = (pcmChunks: Buffer[], sampleRateHz: number) => {
  const pcm = Buffer.concat(pcmChunks);
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRateHz * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
};

const buildSourceRecord = <T>(factory: () => T): Record<Source, T> => ({
  mic: factory(),
  system: factory()
});

export class OpenAIRealtimeTranscription {
  private readonly sessions = new Map<string, TranscriptionSessionState>();

  constructor(
    private readonly deps: {
      getOpenAIKey: () => Promise<string | null>;
      onTranscriptSegments: (interviewId: string, segments: TranscriptSegment[]) => void;
      logger?: Pick<Console, "info" | "warn" | "error">;
    }
  ) {}

  async start(interviewId: string, options: StartTranscriptionOptions = {}) {
    const existing = this.sessions.get(interviewId);
    if (existing && !existing.closed) {
      return {
        interviewId,
        started: true,
        reused: true,
        mode: "realtime",
        model: existing.realtimeModel
      };
    }

    const apiKey = await this.deps.getOpenAIKey();
    if (!apiKey) {
      throw new Error("OpenAI provider key not found in Keychain. Save key via keys/saveProviderKey first.");
    }

    const state: TranscriptionSessionState = {
      interviewId,
      ws: null,
      bufferedChunksBySource: buildSourceRecord(() => []),
      sourceQueue: [],
      itemSource: new Map(),
      partialByItem: new Map(),
      sampleRateHz: options.sampleRateHz ?? DEFAULT_SAMPLE_RATE,
      realtimeModel: options.realtimeModel ?? DEFAULT_REALTIME_MODEL,
      fallbackModel: options.fallbackModel ?? DEFAULT_FALLBACK_MODEL,
      language: options.language,
      realtimeEvents: 0,
      transcriptSegmentsProduced: 0,
      fallbackUsed: false,
      realtimeFailed: false,
      closed: false,
      isBufferCappedBySource: buildSourceRecord(() => false)
    };

    this.sessions.set(interviewId, state);
    await this.connectRealtimeSocket(apiKey, state);

    return {
      interviewId,
      started: true,
      reused: false,
      mode: "realtime",
      model: state.realtimeModel
    };
  }

  async appendAudio(interviewId: string, input: AudioChunkInput) {
    const state = this.sessions.get(interviewId);
    if (!state || state.closed) {
      throw new Error("Realtime transcription session not started for this interview.");
    }

    if (!input.audioBase64 || typeof input.audioBase64 !== "string") {
      throw new Error("audioBase64 is required for transcription chunk ingestion.");
    }

    const source = input.source;
    if (source !== "mic" && source !== "system") {
      throw new Error("source must be either 'mic' or 'system'.");
    }
    const sampleRateHz = input.sampleRateHz ?? state.sampleRateHz;
    state.sampleRateHz = sampleRateHz;

    const pcmChunk = Buffer.from(input.audioBase64, "base64");
    if (pcmChunk.length === 0) {
      throw new Error("Received empty audio chunk.");
    }

    state.bufferedChunksBySource[source].push(pcmChunk);

    // Trim buffered chunks to stay under the cap so memory doesn't grow unboundedly.
    let totalBytes = state.bufferedChunksBySource[source].reduce((sum, c) => sum + c.length, 0);
    while (totalBytes > MAX_FALLBACK_CHUNKS_BYTES && state.bufferedChunksBySource[source].length > 1) {
      const removed = state.bufferedChunksBySource[source].shift()!;
      totalBytes -= removed.length;
      state.isBufferCappedBySource[source] = true;
    }

    state.sourceQueue.push(source);

    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      state.realtimeFailed = true;
      return {
        interviewId,
        queuedForFallback: true,
        realtimeSent: false,
        chunkBytes: pcmChunk.length
      };
    }

    try {
      state.ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: input.audioBase64
        })
      );
      state.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

      return {
        interviewId,
        queuedForFallback: false,
        realtimeSent: true,
        chunkBytes: pcmChunk.length
      };
    } catch (error) {
      state.realtimeFailed = true;
      this.deps.logger?.warn?.("Failed to send realtime audio chunk", error);
      return {
        interviewId,
        queuedForFallback: true,
        realtimeSent: false,
        chunkBytes: pcmChunk.length
      };
    }
  }

  async stop(interviewId: string): Promise<StopTranscriptionResult> {
    const state = this.sessions.get(interviewId);
    if (!state) {
      return {
        interviewId,
        realtimeEvents: 0,
        transcriptSegmentsProduced: 0,
        fallbackUsed: false
      };
    }

    // Drain any in-flight audio events before final commit
    await wait(600);

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      } catch {
        state.realtimeFailed = true;
      }
    }

    // Allow the final commit to be processed by the server
    await wait(500);

    const needsFallback = state.transcriptSegmentsProduced === 0;
    const sourcesNeedingFallback = needsFallback
      ? AUDIO_SOURCES.filter((source) => state.bufferedChunksBySource[source].length > 0)
      : [];

    if (needsFallback || sourcesNeedingFallback.length > 0) {
      for (const source of sourcesNeedingFallback) {
        try {
          await this.runWhisperFallback(state, source);
        } catch (error) {
          this.deps.logger?.warn?.("Whisper fallback failed", { error, source });
        }
      }
    }

    await this.closeSession(state);

    return {
      interviewId,
      realtimeEvents: state.realtimeEvents,
      transcriptSegmentsProduced: state.transcriptSegmentsProduced,
      fallbackUsed: state.fallbackUsed
    };
  }

  async shutdown() {
    const sessions = [...this.sessions.values()];
    for (const state of sessions) {
      await this.closeSession(state);
    }
    this.sessions.clear();
  }

  private async connectRealtimeSocket(apiKey: string, state: TranscriptionSessionState) {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(state.realtimeModel)}`;
    assertAllowedEgress(url.replace(/^wss:/, "https:"));
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    state.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out connecting to OpenAI Realtime websocket."));
      }, 10_000);

      ws.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.once("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    ws.on("message", (raw: RawData) => {
      const payload = safeJsonParse(raw.toString());
      if (!payload) {
        return;
      }
      this.handleRealtimeEvent(state, payload);
    });

    ws.on("error", (error: Error) => {
      state.realtimeFailed = true;
      this.deps.logger?.warn?.("Realtime websocket error", error);
    });

    ws.on("close", () => {
      if (!state.closed) {
        state.realtimeFailed = true;
      }
    });

    // GA session update shape.
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "transcription",
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: state.sampleRateHz
              },
              transcription: {
                model: state.realtimeModel,
                language: state.language
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 400
              }
            }
          }
        }
      })
    );

    // Backward-compatible event shape for older integrations.
    this.deps.logger?.info?.("Sending backward-compat transcription_session.update");
    ws.send(
      JSON.stringify({
        type: "transcription_session.update",
        session: {
          input_audio_format: "pcm16",
          input_audio_transcription: [
            {
              model: state.realtimeModel,
              language: state.language
            }
          ],
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 400
          }
        }
      })
    );
  }

  private handleRealtimeEvent(state: TranscriptionSessionState, event: Record<string, unknown>) {
    state.realtimeEvents += 1;
    const type = String(event.type ?? "");

    if (type === "error") {
      const errorCode = String((event.error as Record<string, unknown>)?.code ?? "");
      const errorType = String((event.error as Record<string, unknown>)?.type ?? "");
      // Fatal errors that indicate the session cannot continue
      const isFatal =
        errorType === "invalid_request_error" ||
        errorCode === "session_expired" ||
        errorCode === "model_not_found" ||
        errorCode === "insufficient_quota";

      if (isFatal) {
        state.realtimeFailed = true;
      }
      this.deps.logger?.warn?.("Realtime event error", { event, isFatal });
      return;
    }

    if (type === "input_audio_buffer.committed") {
      const itemId = String(event.item_id ?? "");
      if (itemId) {
        const source = state.sourceQueue.shift() ?? "system";
        state.itemSource.set(itemId, source);
      }
      return;
    }

    if (type === "conversation.item.input_audio_transcription.delta") {
      const itemId = String(event.item_id ?? "");
      const delta = String(event.delta ?? "");
      if (itemId && delta) {
        const current = state.partialByItem.get(itemId) ?? "";
        state.partialByItem.set(itemId, `${current}${delta}`);
      }
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const itemId = String(event.item_id ?? "");
      const transcript = String(event.transcript ?? "").trim();
      const partial = state.partialByItem.get(itemId) ?? "";
      const finalText = transcript || partial;

      if (!finalText) {
        return;
      }

      state.partialByItem.delete(itemId);
      const source = state.itemSource.get(itemId) ?? "system";
      state.itemSource.delete(itemId);

      this.emitSegments(state, [
        {
          id: randomUUID(),
          speaker: speakerForSource(source),
          text: finalText,
          timestampMs: Date.now(),
          source
        }
      ]);
    }
  }

  private emitSegments(state: TranscriptionSessionState, segments: TranscriptSegment[]) {
    if (segments.length === 0) {
      return;
    }

    state.transcriptSegmentsProduced += segments.length;
    this.deps.onTranscriptSegments(state.interviewId, segments);
  }

  private async runWhisperFallback(state: TranscriptionSessionState, source: Source) {
    const apiKey = await this.deps.getOpenAIKey();
    if (!apiKey) {
      throw new Error("OpenAI provider key not found for Whisper fallback.");
    }

    if (state.isBufferCappedBySource[source]) {
      this.deps.logger?.warn?.("Whisper fallback audio is truncated: buffer was capped at 10 minutes. Earlier audio was dropped.", {
        source
      });
    }

    const wav = buildWavFromPcm16(state.bufferedChunksBySource[source], state.sampleRateHz);
    const form = new FormData();
    form.append("model", state.fallbackModel);
    if (state.language) {
      form.append("language", state.language);
    }
    form.append("response_format", "json");
    form.append(
      "file",
      new Blob([wav], { type: "audio/wav" }),
      `interview-${state.interviewId}-${Date.now()}.wav`
    );

    const response = await safeFetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Whisper fallback failed: ${text}`);
    }

    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim();
    if (!text) {
      return;
    }

    state.fallbackUsed = true;

    this.emitSegments(state, [
      {
        id: randomUUID(),
        speaker: speakerForSource(source),
        text,
        timestampMs: Date.now(),
        source
      }
    ]);
  }

  private async closeSession(state: TranscriptionSessionState) {
    state.closed = true;

    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      await new Promise<void>((resolve) => {
        const ws = state.ws;
        if (!ws) {
          resolve();
          return;
        }
        const done = () => resolve();
        ws.once("close", done);
        try {
          ws.close();
        } catch {
          resolve();
        }
        setTimeout(resolve, 700);
      });
    }

    state.ws = null;
    this.sessions.delete(state.interviewId);
  }
}
