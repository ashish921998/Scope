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

export interface StopTranscriptionResult {
  sessionId: string;
  sessionKind: TranscriptionSessionRef["kind"];
  realtimeEvents: number;
  transcriptSegmentsProduced: number;
  fallbackUsed: boolean;
}

export interface TranscriptionProvider {
  start(ref: TranscriptionSessionRef, options?: StartTranscriptionOptions): Promise<unknown>;
  appendAudio(ref: TranscriptionSessionRef, input: AudioChunkInput): Promise<unknown>;
  stop(ref: TranscriptionSessionRef): Promise<StopTranscriptionResult>;
  shutdown(): Promise<void>;
}
