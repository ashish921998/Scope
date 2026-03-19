import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import WebSocket, { type RawData } from "ws";
import type { TranscriptSegment, TranscriptionSessionRef } from "@scope/types";
import { assertAllowedEgress } from "@scope/core";
import type {
  AudioChunkInput,
  StartTranscriptionOptions,
  StopTranscriptionResult,
  TranscriptionProvider
} from "./types";

type MeetingSessionRef = { id: string; kind: "meeting" };

interface DeepgramSessionState {
  ref: MeetingSessionRef;
  ws: WebSocket | null;
  sampleRateHz: number;
  language?: string;
  realtimeEvents: number;
  transcriptSegmentsProduced: number;
  fallbackUsed: boolean;
  closed: boolean;
}

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_MODEL = "nova-2";

const safeJsonParse = (raw: string) => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const normalizeSpeaker = (speaker: unknown): TranscriptSegment["speaker"] => {
  if (speaker === "interviewer" || speaker === "customer" || speaker === "system") {
    return speaker;
  }
  return "system";
};

export class DeepgramStreamingTranscription implements TranscriptionProvider {
  private readonly sessions = new Map<string, DeepgramSessionState>();

  constructor(
    private readonly deps: {
      getDeepgramKey: () => Promise<string | null>;
      onTranscriptSegments: (ref: TranscriptionSessionRef, segments: TranscriptSegment[]) => void;
      logger?: Pick<Console, "info" | "warn" | "error">;
    }
  ) {}

  async start(ref: TranscriptionSessionRef, options: StartTranscriptionOptions = {}) {
    if (ref.kind !== "meeting") {
      throw new Error("Deepgram transcription only supports meeting sessions.");
    }
    const meetingRef: MeetingSessionRef = { id: ref.id, kind: "meeting" };

    const existing = this.sessions.get(meetingRef.id);
    if (existing && !existing.closed) {
      return {
        sessionId: ref.id,
        sessionKind: meetingRef.kind,
        started: true,
        reused: true,
        mode: "realtime",
        model: DEFAULT_MODEL
      };
    }

    const apiKey = await this.deps.getDeepgramKey();
    if (!apiKey) {
      throw new Error("Deepgram provider key not found in Keychain. Save key via keys/saveProviderKey first.");
    }

    const state: DeepgramSessionState = {
      ref: meetingRef,
      ws: null,
      sampleRateHz: options.sampleRateHz ?? DEFAULT_SAMPLE_RATE,
      language: options.language,
      realtimeEvents: 0,
      transcriptSegmentsProduced: 0,
      fallbackUsed: false,
      closed: false
    };

    this.sessions.set(meetingRef.id, state);
    await this.connectRealtimeSocket(apiKey, state);

    return {
      sessionId: meetingRef.id,
      sessionKind: meetingRef.kind,
      started: true,
      reused: false,
      mode: "realtime",
      model: DEFAULT_MODEL
    };
  }

  async appendAudio(ref: TranscriptionSessionRef, input: AudioChunkInput) {
    if (ref.kind !== "meeting") {
      throw new Error("Deepgram transcription only supports meeting sessions.");
    }
    const meetingRef: MeetingSessionRef = { id: ref.id, kind: "meeting" };

    const state = this.sessions.get(meetingRef.id);
    if (!state || state.closed) {
      throw new Error("Realtime transcription session not started for this meeting.");
    }

    if (!input.audioBase64 || typeof input.audioBase64 !== "string") {
      throw new Error("audioBase64 is required for transcription chunk ingestion.");
    }

    const chunk = Buffer.from(input.audioBase64, "base64");
    if (chunk.length === 0) {
      throw new Error("Received empty audio chunk.");
    }

    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Deepgram realtime websocket is not connected.");
    }

    state.sampleRateHz = input.sampleRateHz ?? state.sampleRateHz;
    state.ws.send(chunk);

      return {
      sessionId: meetingRef.id,
      sessionKind: meetingRef.kind,
      realtimeSent: true,
      chunkBytes: chunk.length
    };
  }

  async stop(ref: TranscriptionSessionRef): Promise<StopTranscriptionResult> {
    if (ref.kind !== "meeting") {
      throw new Error("Deepgram transcription only supports meeting sessions.");
    }
    const meetingRef: MeetingSessionRef = { id: ref.id, kind: "meeting" };

    const state = this.sessions.get(meetingRef.id);
    if (!state) {
      return {
        sessionId: meetingRef.id,
        sessionKind: meetingRef.kind,
        realtimeEvents: 0,
        transcriptSegmentsProduced: 0,
        fallbackUsed: false
      };
    }

    await this.closeSession(state);
    return {
      sessionId: meetingRef.id,
      sessionKind: meetingRef.kind,
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

  private async connectRealtimeSocket(apiKey: string, state: DeepgramSessionState) {
    const params = new URLSearchParams({
      model: DEFAULT_MODEL,
      encoding: "linear16",
      sample_rate: String(state.sampleRateHz),
      channels: "1",
      punctuate: "true",
      interim_results: "true",
      diarize: "true"
    });
    if (state.language) {
      params.set("language", state.language);
    }

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    assertAllowedEgress(url.replace(/^wss:/, "https:"));
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Token ${apiKey}`
      }
    });

    state.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out connecting to Deepgram realtime websocket."));
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
      this.deps.logger?.warn?.("Deepgram websocket error", error);
    });
  }

  private handleRealtimeEvent(state: DeepgramSessionState, event: Record<string, unknown>) {
    state.realtimeEvents += 1;
    const channel = event.channel as { alternatives?: Array<Record<string, unknown>> } | undefined;
    const alternative = channel?.alternatives?.[0];
    const transcript = String(alternative?.transcript ?? "").trim();
    const isFinal = Boolean(event.is_final);

    if (!isFinal || !transcript) {
      return;
    }

    const words = Array.isArray(alternative?.words) ? alternative?.words : [];
    const firstWord = words[0] as Record<string, unknown> | undefined;
    const speaker = normalizeSpeaker(firstWord?.speaker);

    this.emitSegments(state, [
      {
        id: randomUUID(),
        speaker,
        text: transcript,
        timestampMs: Date.now()
      }
    ]);
  }

  private emitSegments(state: DeepgramSessionState, segments: TranscriptSegment[]) {
    if (segments.length === 0) {
      return;
    }

    state.transcriptSegmentsProduced += segments.length;
    this.deps.onTranscriptSegments(state.ref, segments);
  }

  private async closeSession(state: DeepgramSessionState) {
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
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "CloseStream" }));
          }
          ws.close();
        } catch {
          resolve();
        }
        setTimeout(resolve, 700);
      });
    }

    state.ws = null;
    this.sessions.delete(state.ref.id);
  }
}
