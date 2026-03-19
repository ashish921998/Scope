"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import { float32ToPcm16Base64, captureMicPcm16Chunk } from "../lib/audio";

const AUDIO_PROCESSOR_WORKLET = `
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}
registerProcessor("scope-live-processor", AudioProcessor);
`;

export interface InterviewCardProps {
  setOutput: (output: string) => void;
  registerTourTarget: (id: "interviewStart") => (node: HTMLElement | null) => void;
}

export function InterviewCard({ setOutput, registerTourTarget }: InterviewCardProps) {
  const [consent, setConsent] = useState(true);
  const [interviewId, setInterviewId] = useState("");
  const [transcriptText, setTranscriptText] = useState("Customer says onboarding feels manual and slow.");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("en");
  const [chunkSpeaker, setChunkSpeaker] = useState("customer");
  const [audioBase64, setAudioBase64] = useState("");
  const [micCaptureSeconds, setMicCaptureSeconds] = useState("3");
  const [liveCapturing, setLiveCapturing] = useState(false);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [openaiKey, setOpenaiKey] = useState("");
  const liveCleanupRef = useRef<null | (() => Promise<void> | void)>(null);
  const sendingChunkRef = useRef(Promise.resolve());

  useEffect(() => {
    return () => {
      if (liveCleanupRef.current) {
        void liveCleanupRef.current();
      }
    };
  }, []);

  return (
    <section className="card">
      <h2>Interview Copilot</h2>
      <label>
        OpenAI API Key (saved to Keychain)
        <input
          type="password"
          placeholder="sk-..."
          value={openaiKey}
          onChange={(e) => setOpenaiKey(e.target.value)}
        />
      </label>
      <button
        className="secondary"
        onClick={async () => {
          try {
            if (!window.scope) {
              setOutput("Desktop IPC bridge unavailable. Run in Electron desktop app.");
              return;
            }
            const result = await window.scope.saveProviderKey("openai", openaiKey);
            setOutput(JSON.stringify(result, null, 2));
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Save OpenAI Key
      </button>
      <label>
        Consent Accepted
        <select value={consent ? "yes" : "no"} onChange={(e) => setConsent(e.target.value === "yes")}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <button
        ref={registerTourTarget("interviewStart")}
        className="tour-target"
        onClick={async () => {
          try {
            const session = await fetchJson("/v1/interviews/start", {
              method: "POST",
              body: JSON.stringify({ consentAccepted: consent })
            });
            setInterviewId(session.id);
            setOutput(JSON.stringify(session, null, 2));
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Start Interview
      </button>
      <label>
        Transcript Segment
        <textarea value={transcriptText} onChange={(e) => setTranscriptText(e.target.value)} />
      </label>
      <label>
        Realtime Language
        <input value={transcriptionLanguage} onChange={(e) => setTranscriptionLanguage(e.target.value)} />
      </label>
      <button
        className="secondary"
        onClick={async () => {
          try {
            if (!interviewId) {
              setOutput("Start interview first.");
              return;
            }
            const result = await fetchJson(`/v1/interviews/${interviewId}/transcription/start`, {
              method: "POST",
              body: JSON.stringify({
                language: transcriptionLanguage
              })
            });
            setOutput(JSON.stringify(result, null, 2));
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Start Realtime Transcription
      </button>
      <label>
        Audio Chunk (PCM16 Base64)
        <textarea
          placeholder="Paste base64-encoded PCM16 mono chunk"
          value={audioBase64}
          onChange={(e) => setAudioBase64(e.target.value)}
        />
      </label>
      <label>
        Mic Capture Seconds
        <input
          value={micCaptureSeconds}
          onChange={(e) => setMicCaptureSeconds(e.target.value)}
          placeholder="3"
        />
      </label>
      <label>
        Include System Audio
        <select
          value={includeSystemAudio ? "yes" : "no"}
          onChange={(e) => setIncludeSystemAudio(e.target.value === "yes")}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <button
        className="secondary"
        onClick={async () => {
          try {
            const seconds = Number(micCaptureSeconds || "3");
            const chunk = await captureMicPcm16Chunk(Math.max(1, seconds) * 1000, 24000);
            setAudioBase64(chunk);
            setOutput(`Captured mic chunk (${chunk.length} base64 chars).`);
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Capture Mic Chunk
      </button>
      <button
        className="secondary"
        onClick={async () => {
          try {
            if (!interviewId) {
              setOutput("Start interview first.");
              return;
            }
            if (liveCapturing) {
              setOutput("Live capture already running.");
              return;
            }

            await fetchJson(`/v1/interviews/${interviewId}/transcription/start`, {
              method: "POST",
              body: JSON.stringify({
                language: transcriptionLanguage
              })
            });

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const systemStream =
              includeSystemAudio && navigator.mediaDevices.getDisplayMedia
                ? await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
                : null;
            const ctx = new AudioContext({ sampleRate: 24000 });

            const blob = new Blob([AUDIO_PROCESSOR_WORKLET], { type: "application/javascript" });
            const workletUrl = URL.createObjectURL(blob);
            try {
              await ctx.audioWorklet.addModule(workletUrl);
            } finally {
              URL.revokeObjectURL(workletUrl);
            }

            const source = ctx.createMediaStreamSource(stream);
            const systemAudioTracks = systemStream?.getAudioTracks() ?? [];
            const systemSource =
              systemStream && systemAudioTracks.length > 0 ? ctx.createMediaStreamSource(systemStream) : null;
            const workletNode = new AudioWorkletNode(ctx, "scope-live-processor");

            workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
              const input = event.data;
              const chunkBase64 = float32ToPcm16Base64(input);
              sendingChunkRef.current = sendingChunkRef.current
                .then(() =>
                  fetchJson(`/v1/interviews/${interviewId}/transcription/chunk`, {
                    method: "POST",
                    body: JSON.stringify({ audioBase64: chunkBase64, speaker: chunkSpeaker })
                  })
                )
                .catch(() => {});
            };

            source.connect(workletNode);
            if (systemSource) {
              systemSource.connect(workletNode);
            }
            workletNode.connect(ctx.destination);
            setLiveCapturing(true);
            setOutput("Live mic streaming started.");

            liveCleanupRef.current = async () => {
              workletNode.disconnect();
              source.disconnect();
              if (systemSource) {
                systemSource.disconnect();
              }
              stream.getTracks().forEach((track) => track.stop());
              systemStream?.getTracks().forEach((track) => track.stop());
              await ctx.close();
              await sendingChunkRef.current.catch(() => {});
              await fetchJson(`/v1/interviews/${interviewId}/transcription/stop`, {
                method: "POST",
                body: JSON.stringify({})
              });
              setLiveCapturing(false);
            };
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Start Live Mic Stream
      </button>
      <button
        className="secondary"
        onClick={async () => {
          try {
            if (!liveCleanupRef.current) {
              setOutput("Live capture is not running.");
              return;
            }
            await liveCleanupRef.current();
            liveCleanupRef.current = null;
            setOutput("Live mic streaming stopped.");
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Stop Live Mic Stream
      </button>
      <label>
        Chunk Speaker
        <select value={chunkSpeaker} onChange={(e) => setChunkSpeaker(e.target.value)}>
          <option value="customer">Customer</option>
          <option value="interviewer">Interviewer</option>
        </select>
      </label>
      <button
        className="secondary"
        onClick={async () => {
          try {
            if (!interviewId) {
              setOutput("Start interview first.");
              return;
            }
            const result = await fetchJson(`/v1/interviews/${interviewId}/transcription/chunk`, {
              method: "POST",
              body: JSON.stringify({
                audioBase64,
                speaker: chunkSpeaker
              })
            });
            setOutput(JSON.stringify(result, null, 2));
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Stream Audio Chunk
      </button>
      <button
        className="secondary"
        onClick={async () => {
          try {
            if (!interviewId) {
              setOutput("Start interview first.");
              return;
            }
            const result = await fetchJson(`/v1/interviews/${interviewId}/transcription/stop`, {
              method: "POST",
              body: JSON.stringify({})
            });
            setOutput(JSON.stringify(result, null, 2));
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Stop Realtime Transcription
      </button>
      <button
        className="secondary"
        onClick={async () => {
          if (!interviewId) { setOutput("Start interview first."); return; }
          const segments = [{ id: crypto.randomUUID(), speaker: "customer" as const, text: transcriptText, timestampMs: Date.now() }];
          try {
            const result = await fetchJson(`/v1/interviews/${interviewId}/transcript`, {
              method: "POST",
              body: JSON.stringify({ segments })
            });
            setOutput(JSON.stringify(result, null, 2));
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Append Transcript
      </button>
      <button
        className="secondary"
        onClick={async () => {
          try {
            if (!interviewId) {
              setOutput("Start interview first.");
              return;
            }
            const result = await fetchJson(`/v1/interviews/${interviewId}/stop`, {
              method: "POST",
              body: JSON.stringify({})
            });
            setOutput(JSON.stringify(result, null, 2));
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Stop + Debrief
      </button>
    </section>
  );
}
