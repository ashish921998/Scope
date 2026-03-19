"use client";

import type { MeetingPermissions, MeetingSession } from "@scope/types";
import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import { float32ToPcm16Base64 } from "../lib/audio";

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
registerProcessor("scope-live-meeting-processor", AudioProcessor);
`;

export interface MeetingCardProps {
  setOutput: (output: string) => void;
  registerTourTarget: (id: "interviewStart") => (node: HTMLElement | null) => void;
}

const EMPTY_PERMISSIONS: MeetingPermissions = {
  microphone: "unknown",
  screenCapture: "unknown"
};

const formatStatus = (status: string) => status.replace(/-/g, " ");

export function MeetingCard({ setOutput, registerTourTarget }: MeetingCardProps) {
  const [meetingTitle, setMeetingTitle] = useState("Customer discovery sync");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [openaiKey, setOpenaiKey] = useState("");
  const [permissions, setPermissions] = useState<MeetingPermissions>(EMPTY_PERMISSIONS);
  const [recentMeetings, setRecentMeetings] = useState<MeetingSession[]>([]);
  const [activeMeeting, setActiveMeeting] = useState<MeetingSession | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [polling, setPolling] = useState(false);
  const liveCleanupRef = useRef<null | (() => Promise<void>)>(null);
  const sendingChunkRef = useRef(Promise.resolve());

  const refreshPermissions = async () => {
    if (!window.scope?.getMeetingPermissions) {
      setOutput("Desktop IPC bridge unavailable. Run in Electron desktop app.");
      return;
    }
    const next = await window.scope.getMeetingPermissions();
    setPermissions(next);
  };

  const refreshRecentMeetings = async () => {
    if (!window.scope?.listRecentMeetings) {
      return;
    }
    const items = await window.scope.listRecentMeetings();
    setRecentMeetings(items);
  };

  const refreshMeeting = async (meetingId: string) => {
    if (!window.scope?.getMeeting) {
      return;
    }
    const meeting = await window.scope.getMeeting(meetingId);
    setActiveMeeting(meeting);
    return meeting;
  };

  useEffect(() => {
    void refreshPermissions().catch((error) => setOutput((error as Error).message));
    void refreshRecentMeetings().catch((error) => setOutput((error as Error).message));

    return () => {
      if (liveCleanupRef.current) {
        void liveCleanupRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (!polling || !activeMeeting?.id) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshMeeting(activeMeeting.id).catch(() => {});
    }, 1000);

    return () => window.clearInterval(interval);
  }, [polling, activeMeeting?.id]);

  const startMeeting = async () => {
    if (!window.scope?.startMeeting || !window.scope?.startMeetingCapture) {
      setOutput("Desktop IPC bridge unavailable. Run in Electron desktop app.");
      return;
    }

    if (!consentAccepted) {
      setOutput("Consent is required before recording starts.");
      return;
    }

    setIsStarting(true);
    let meeting: MeetingSession | null = null;
    let captureStarted = false;
    let micStream: MediaStream | null = null;
    let systemStream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      meeting = await window.scope.startMeeting({
        consentAccepted: true,
        title: meetingTitle
      });
      setActiveMeeting(meeting);
      await window.scope.startMeetingCapture(meeting.id, "default", includeSystemAudio);
      captureStarted = true;

      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      systemStream =
        includeSystemAudio && navigator.mediaDevices.getDisplayMedia
          ? await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
          : null;
      ctx = new AudioContext({ sampleRate: 24000 });

      const blob = new Blob([AUDIO_PROCESSOR_WORKLET], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      try {
        await ctx.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      const micSource = ctx.createMediaStreamSource(micStream);
      const micNode = new AudioWorkletNode(ctx, "scope-live-meeting-processor");
      micNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const chunkBase64 = float32ToPcm16Base64(event.data);
          sendingChunkRef.current = sendingChunkRef.current
            .then(() =>
              fetchJson(`/v1/meetings/${meeting.id}/transcription/chunk`, {
                method: "POST",
                body: JSON.stringify({ audioBase64: chunkBase64, speaker: "customer" })
              })
            )
            .catch(() => {});
      };
      micSource.connect(micNode);
      micNode.connect(ctx.destination);

      const systemAudioTracks = systemStream?.getAudioTracks() ?? [];
      const systemSource =
        systemStream && systemAudioTracks.length > 0 ? ctx.createMediaStreamSource(systemStream) : null;
      const systemNode = systemSource ? new AudioWorkletNode(ctx, "scope-live-meeting-processor") : null;

      if (systemSource && systemNode) {
        systemNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
          const chunkBase64 = float32ToPcm16Base64(event.data);
          sendingChunkRef.current = sendingChunkRef.current
            .then(() =>
              fetchJson(`/v1/meetings/${meeting.id}/transcription/chunk`, {
                method: "POST",
                body: JSON.stringify({ audioBase64: chunkBase64, speaker: "system" })
              })
            )
            .catch(() => {});
        };
        systemSource.connect(systemNode);
        systemNode.connect(ctx.destination);
      }

      liveCleanupRef.current = async () => {
        micNode.disconnect();
        micSource.disconnect();
        if (systemNode) {
          systemNode.disconnect();
        }
        if (systemSource) {
          systemSource.disconnect();
        }
        micStream?.getTracks().forEach((track) => track.stop());
        systemStream?.getTracks().forEach((track) => track.stop());
        await ctx.close();
        await sendingChunkRef.current.catch(() => {});
        await window.scope?.stopMeetingCapture?.(meeting.id);
        const completed = await refreshMeeting(meeting.id);
        if (completed) {
          setOutput(JSON.stringify(completed.notes ?? completed, null, 2));
        }
        await refreshRecentMeetings();
        setIsRecording(false);
        setPolling(false);
      };

      setIsRecording(true);
      setPolling(true);
      await refreshRecentMeetings();
      setOutput(`Meeting ${meeting.id} is recording.`);
    } catch (error) {
      micStream?.getTracks().forEach((track) => track.stop());
      systemStream?.getTracks().forEach((track) => track.stop());
      if (ctx) {
        await ctx.close().catch(() => {});
      }
      if (captureStarted && meeting?.id) {
        await window.scope?.stopMeetingCapture?.(meeting.id).catch(() => {});
      }
      liveCleanupRef.current = null;
      setIsRecording(false);
      setPolling(false);
      setOutput((error as Error).message);
    } finally {
      setIsStarting(false);
    }
  };

  const stopMeeting = async () => {
    if (!liveCleanupRef.current) {
      setOutput("Meeting capture is not running.");
      return;
    }
    try {
      const cleanup = liveCleanupRef.current;
      liveCleanupRef.current = null;
      await cleanup();
    } catch (error) {
      setOutput((error as Error).message);
    }
  };

  const transcriptLines = activeMeeting?.transcriptSegments ?? [];

  return (
    <section className="card">
      <h2>Meeting Copilot</h2>
      <p className="card-copy">Consent-gated meeting capture with live transcript polling, notes, and recent sessions.</p>

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

      <div className="meeting-status-grid">
        <div className="meeting-status-pill">
          <strong>Microphone</strong>
          <span>{formatStatus(permissions.microphone)}</span>
        </div>
        <div className="meeting-status-pill">
          <strong>Screen/System</strong>
          <span>{formatStatus(permissions.screenCapture)}</span>
        </div>
      </div>

      <div className="meeting-actions-inline">
        <button className="secondary" onClick={() => void refreshPermissions().catch((error) => setOutput((error as Error).message))}>
          Refresh Permissions
        </button>
        <button className="secondary" onClick={() => void window.scope?.openMeetingPermissionsSettings?.()}>
          Open System Settings
        </button>
      </div>

      <label>
        Meeting Title
        <input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} />
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={consentAccepted}
          onChange={(e) => setConsentAccepted(e.target.checked)}
        />
        <span>I confirm all participants have consented to recording.</span>
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
        ref={registerTourTarget("interviewStart")}
        className="tour-target"
        disabled={
          isStarting ||
          isRecording ||
          !consentAccepted ||
          permissions.microphone === "denied" ||
          (includeSystemAudio && permissions.screenCapture === "denied")
        }
        onClick={() => void startMeeting()}
      >
        {isStarting ? "Starting..." : isRecording ? "Recording" : "Start Meeting"}
      </button>
      <button className="secondary" disabled={!isRecording} onClick={() => void stopMeeting()}>
        Stop Meeting
      </button>

      <div className="meeting-section">
        <h3>Live Transcript</h3>
        <div className="meeting-scroll-panel">
          {transcriptLines.length === 0 ? (
            <small>No transcript yet.</small>
          ) : (
            transcriptLines.map((segment) => (
              <div key={segment.id} className="meeting-line">
                <strong>{segment.speaker}</strong>
                <span>{segment.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="meeting-section">
        <h3>Post-Meeting Notes</h3>
        <div className="meeting-scroll-panel">
          {activeMeeting?.notes ? (
            <>
              <p>{activeMeeting.notes.summary}</p>
              <strong>Key Decisions</strong>
              <ul className="meeting-list">
                {activeMeeting.notes.keyDecisions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <strong>Action Items</strong>
              <ul className="meeting-list">
                {activeMeeting.notes.actionItems.map((item) => (
                  <li key={item.text}>{item.text}</li>
                ))}
              </ul>
            </>
          ) : (
            <small>Notes will appear after the meeting ends.</small>
          )}
        </div>
      </div>

      <div className="meeting-section">
        <div className="meeting-section-header">
          <h3>Recent Meetings</h3>
          <button className="secondary" onClick={() => void refreshRecentMeetings().catch((error) => setOutput((error as Error).message))}>
            Refresh
          </button>
        </div>
        <div className="meeting-scroll-panel">
          {recentMeetings.length === 0 ? (
            <small>No recent meetings yet.</small>
          ) : (
            recentMeetings.map((meeting) => (
              <button
                key={meeting.id}
                className="meeting-history-button"
                onClick={() => void refreshMeeting(meeting.id).catch((error) => setOutput((error as Error).message))}
              >
                <strong>{meeting.title}</strong>
                <span>{meeting.status} · {new Date(meeting.startedAt).toLocaleString()}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
