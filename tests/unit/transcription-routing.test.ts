import { describe, expect, it } from "vitest";
import { DeepgramStreamingTranscription } from "../../apps/desktop/src/transcription/deepgramTranscription";
import { OpenAIRealtimeTranscription } from "../../apps/desktop/src/transcription/openaiRealtimeTranscription";
import { TranscriptionRouter } from "../../apps/desktop/src/transcription/transcriptionRouter";
import type { TranscriptionProvider } from "../../apps/desktop/src/transcription/types";

describe("transcription providers", () => {
  it("rejects meeting refs for OpenAI transcription", async () => {
    const provider = new OpenAIRealtimeTranscription({
      getOpenAIKey: async () => "sk-test",
      onTranscriptSegments: () => {}
    });

    await expect(provider.start({ id: "meeting-1", kind: "meeting" })).rejects.toThrow(
      "OpenAI realtime transcription only supports interview sessions."
    );
  });

  it("rejects interview refs for Deepgram transcription", async () => {
    const provider = new DeepgramStreamingTranscription({
      getDeepgramKey: async () => "dg-test",
      onTranscriptSegments: () => {}
    });

    await expect(provider.start({ id: "interview-1", kind: "interview" })).rejects.toThrow(
      "Deepgram transcription only supports meeting sessions."
    );
  });

  it("requires a Deepgram key for meeting sessions", async () => {
    const provider = new DeepgramStreamingTranscription({
      getDeepgramKey: async () => null,
      onTranscriptSegments: () => {}
    });

    await expect(provider.start({ id: "meeting-1", kind: "meeting" })).rejects.toThrow(
      "Deepgram provider key not found"
    );
  });
});

describe("transcription router", () => {
  it("routes operations by session kind and shuts all providers down", async () => {
    const events: string[] = [];

    const makeProvider = (kind: "interview" | "meeting"): TranscriptionProvider => ({
      start: async (ref) => {
        events.push(`start:${kind}:${ref.id}`);
        return { ok: true };
      },
      appendAudio: async (ref) => {
        events.push(`chunk:${kind}:${ref.id}`);
        return { ok: true };
      },
      stop: async (ref) => {
        events.push(`stop:${kind}:${ref.id}`);
        return {
          sessionId: ref.id,
          sessionKind: ref.kind,
          realtimeEvents: 0,
          transcriptSegmentsProduced: 0,
          fallbackUsed: false
        };
      },
      shutdown: async () => {
        events.push(`shutdown:${kind}`);
      }
    });

    const router = new TranscriptionRouter({
      interview: makeProvider("interview"),
      meeting: makeProvider("meeting")
    });

    await router.start({ id: "i-1", kind: "interview" });
    await router.appendAudio({ id: "m-1", kind: "meeting" }, { audioBase64: "YQ==" });
    await router.stop({ id: "i-1", kind: "interview" });
    await router.shutdown();

    expect(events).toEqual([
      "start:interview:i-1",
      "chunk:meeting:m-1",
      "stop:interview:i-1",
      "shutdown:interview",
      "shutdown:meeting"
    ]);
  });
});
