import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIRealtimeTranscription } from "../../apps/desktop/src/transcription/openaiRealtimeTranscription";

const createSessionState = () => ({
  interviewId: "interview-1",
  ws: null,
  bufferedChunksBySource: { mic: [], system: [] },
  sourceQueue: [],
  itemSource: new Map(),
  partialByItem: new Map(),
  sampleRateHz: 24000,
  realtimeModel: "gpt-4o-mini-transcribe",
  fallbackModel: "whisper-1",
  language: "en",
  realtimeEvents: 0,
  transcriptSegmentsProduced: 0,
  fallbackUsed: false,
  realtimeFailed: false,
  closed: false,
  isBufferCappedBySource: { mic: false, system: false }
});

describe("OpenAIRealtimeTranscription", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps committed mic/system chunks to transcript speaker labels", () => {
    const emitted: Array<{ speaker: string; source?: string; text: string }> = [];
    const transcription = new OpenAIRealtimeTranscription({
      getOpenAIKey: async () => "sk-test",
      onTranscriptSegments: (_interviewId, segments) => {
        emitted.push(...segments);
      }
    });

    const state = createSessionState();
    state.sourceQueue.push("mic");
    state.sourceQueue.push("system");

    const internals = transcription as unknown as {
      handleRealtimeEvent: (state: ReturnType<typeof createSessionState>, event: Record<string, unknown>) => void;
    };

    internals.handleRealtimeEvent(state, { type: "input_audio_buffer.committed", item_id: "mic-item" });
    internals.handleRealtimeEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "mic-item",
      transcript: "hello from me"
    });
    internals.handleRealtimeEvent(state, { type: "input_audio_buffer.committed", item_id: "system-item" });
    internals.handleRealtimeEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "system-item",
      transcript: "hello from remote"
    });

    expect(emitted).toMatchObject([
      { speaker: "me", source: "mic", text: "hello from me" },
      { speaker: "speaker_remote", source: "system", text: "hello from remote" }
    ]);
  });

  it("runs whisper fallback independently per source", async () => {
    const emitted: Array<{ speaker: string; source?: string; text: string }> = [];
    const transcription = new OpenAIRealtimeTranscription({
      getOpenAIKey: async () => "sk-test",
      onTranscriptSegments: (_interviewId, segments) => {
        emitted.push(...segments);
      }
    });

    const state = createSessionState();
    state.bufferedChunksBySource.mic.push(Buffer.from([0, 1, 2, 3]));
    state.bufferedChunksBySource.system.push(Buffer.from([4, 5, 6, 7]));

    (transcription as unknown as { sessions: Map<string, typeof state> }).sessions.set("interview-1", state);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "mic transcript" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "system transcript" }), { status: 200 }));

    const result = await transcription.stop("interview-1");

    expect(result.fallbackUsed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(emitted).toMatchObject([
      { speaker: "me", source: "mic", text: "mic transcript" },
      { speaker: "speaker_remote", source: "system", text: "system transcript" }
    ]);
  });
});
