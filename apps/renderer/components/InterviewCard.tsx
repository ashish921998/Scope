"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import { captureMicPcm16Chunk, float32ToPcm16Base64 } from "../lib/audio";

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
  const [chunkSource, setChunkSource] = useState<"mic" | "system">("mic");
  const [audioBase64, setAudioBase64] = useState("");
  const [micCaptureSeconds, setMicCaptureSeconds] = useState("3");
  const [liveCapturing, setLiveCapturing] = useState(false);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [liveCaptureMode, setLiveCaptureMode] = useState<"native" | "browser">("native");
  const [openaiKey, setOpenaiKey] = useState("");
  const liveCleanupRef = useRef<null | (() => Promise<void> | void)>(null);
  const sendingChunkRef = useRef(Promise.resolve());

  const requestSystemAudioStream = async () => {
    if (!includeSystemAudio || !navigator.mediaDevices.getDisplayMedia) {
      return null;
    }

    try {
      return await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false });
    } catch (error) {
      const name = (error as Error).name;
      if (name !== "TypeError" && name !== "NotSupportedError" && name !== "OverconstrainedError") {
        throw error;
      }
      return navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    }
  };

  useEffect(() => {
    return () => {
      if (liveCleanupRef.current) {
        void liveCleanupRef.current();
      }
    };
  }, []);

  const startBrowserFallbackCapture = async () => {
    await fetchJson(`/v1/interviews/${interviewId}/transcription/start`, {
      method: "POST",
      body: JSON.stringify({
        language: transcriptionLanguage
      })
    });

    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const systemStream = await requestSystemAudioStream();
    const ctx = new AudioContext({ sampleRate: 24000 });

    const blob = new Blob([AUDIO_PROCESSOR_WORKLET], { type: "application/javascript" });
    const workletUrl = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const micSource = ctx.createMediaStreamSource(micStream);
    const systemAudioTracks = systemStream?.getAudioTracks() ?? [];
    const systemSource =
      systemStream && systemAudioTracks.length > 0 ? ctx.createMediaStreamSource(systemStream) : null;
    const workletNode = new AudioWorkletNode(ctx, "scope-live-processor");

    workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const chunkBase64 = float32ToPcm16Base64(event.data);
      sendingChunkRef.current = sendingChunkRef.current
        .then(() =>
          fetchJson(`/v1/interviews/${interviewId}/transcription/chunk`, {
            method: "POST",
            body: JSON.stringify({ audioBase64: chunkBase64, source: chunkSource })
          })
        )
        .catch(() => {});
    };

    micSource.connect(workletNode);
    if (systemSource) {
      systemSource.connect(workletNode);
    }
    workletNode.connect(ctx.destination);
    setLiveCapturing(true);
    setOutput("Browser fallback capture started.");

    liveCleanupRef.current = async () => {
      workletNode.disconnect();
      micSource.disconnect();
      if (systemSource) {
        systemSource.disconnect();
      }
      micStream.getTracks().forEach((track) => track.stop());
      systemStream?.getTracks().forEach((track) => track.stop());
      await ctx.close();
      await sendingChunkRef.current.catch(() => {});
      await fetchJson(`/v1/interviews/${interviewId}/transcription/stop`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setLiveCapturing(false);
    };
  };

  const startLiveCapture = async () => {
    if (!interviewId) {
      setOutput("Start interview first.");
      return;
    }
    if (liveCapturing) {
      setOutput("Live capture already running.");
      return;
    }

    if (liveCaptureMode === "native") {
      if (!window.scope) {
        setOutput("Desktop IPC bridge unavailable. Switch to Browser Fallback mode outside Electron.");
        return;
      }
      const result = await window.scope.startCapture(interviewId, "default", includeSystemAudio);
      setLiveCapturing(true);
      setOutput(JSON.stringify(result, null, 2));
      liveCleanupRef.current = async () => {
        await window.scope?.stopCapture(interviewId);
        setLiveCapturing(false);
      };
      return;
    }

    await startBrowserFallbackCapture();
  };

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
        Chunk Source
        <select value={chunkSource} onChange={(e) => setChunkSource(e.target.value as "mic" | "system")}>
          <option value="mic">Mic</option>
          <option value="system">System</option>
        </select>
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
      <label>
        Live Capture Mode
        <select value={liveCaptureMode} onChange={(e) => setLiveCaptureMode(e.target.value as "native" | "browser")}>
          <option value="native">Native</option>
          <option value="browser">Browser Fallback</option>
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
            await startLiveCapture();
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Start Live Capture
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
            setOutput("Live capture stopped.");
          } catch (error) {
            setOutput((error as Error).message);
          }
        }}
      >
        Stop Live Capture
      </button>
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
                source: chunkSource
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
          if (!interviewId) {
            setOutput("Start interview first.");
            return;
          }
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
