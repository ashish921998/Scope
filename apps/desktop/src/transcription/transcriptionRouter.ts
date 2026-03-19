import type { TranscriptionSessionRef } from "@scope/types";
import type {
  AudioChunkInput,
  StartTranscriptionOptions,
  StopTranscriptionResult,
  TranscriptionProvider
} from "./types";

export class TranscriptionRouter implements TranscriptionProvider {
  constructor(
    private readonly providers: Record<TranscriptionSessionRef["kind"], TranscriptionProvider>
  ) {}

  async start(ref: TranscriptionSessionRef, options?: StartTranscriptionOptions) {
    return this.getProvider(ref).start(ref, options);
  }

  async appendAudio(ref: TranscriptionSessionRef, input: AudioChunkInput) {
    return this.getProvider(ref).appendAudio(ref, input);
  }

  async stop(ref: TranscriptionSessionRef): Promise<StopTranscriptionResult> {
    return this.getProvider(ref).stop(ref);
  }

  async shutdown() {
    await Promise.all(Object.values(this.providers).map((provider) => provider.shutdown()));
  }

  private getProvider(ref: TranscriptionSessionRef) {
    const provider = this.providers[ref.kind];
    if (!provider) {
      throw new Error(`No transcription provider configured for session kind: ${ref.kind}`);
    }
    return provider;
  }
}
