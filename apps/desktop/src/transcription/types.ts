import type { TranscriptSegment, TranscriptionSessionRef } from "@scope/types";

export interface StartTranscriptionOptions {
  realtimeModel?: string;
  fallbackModel?: string;
  language?: string;
  sampleRateHz?: number;
}

export interface AudioChunkInput {
  audioBase64: string;
  speaker?: TranscriptSegment["speaker"] | string;
  sampleRateHz?: number;
}

export interface StartTranscriptionResult {
  sessionId: string;
  sessionKind: TranscriptionSessionRef["kind"];
  started: boolean;
  reused: boolean;
  mode: "realtime";
  model: string;
}

export interface AppendAudioResult {
  sessionId: string;
  sessionKind: TranscriptionSessionRef["kind"];
  realtimeSent: boolean;
  chunkBytes: number;
  queuedForFallback?: boolean;
}

export interface StopTranscriptionResult {
  sessionId: string;
  sessionKind: TranscriptionSessionRef["kind"];
  realtimeEvents: number;
  transcriptSegmentsProduced: number;
  fallbackUsed: boolean;
}

export interface TranscriptionProvider {
  start(ref: TranscriptionSessionRef, options?: StartTranscriptionOptions): Promise<StartTranscriptionResult>;
  appendAudio(ref: TranscriptionSessionRef, input: AudioChunkInput): Promise<AppendAudioResult>;
  stop(ref: TranscriptionSessionRef): Promise<StopTranscriptionResult>;
  shutdown(): Promise<void>;
}
