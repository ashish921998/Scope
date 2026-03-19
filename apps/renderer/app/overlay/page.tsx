"use client";

import { useEffect, useMemo, useState } from "react";

interface TranscriptResponse {
  transcriptSegments: Array<{
    id: string;
    speaker: string;
    text: string;
  }>;
}

const formatElapsed = (startedAt: string, nowMs: number) => {
  const elapsedSec = Math.max(0, Math.floor((nowMs - Date.parse(startedAt)) / 1000));
  const minutes = Math.floor(elapsedSec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (elapsedSec % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export default function OverlayPage() {
  const [overlayState, setOverlayState] = useState<Awaited<ReturnType<NonNullable<typeof window.scope>["getOverlayState"]>>>(null);
  const [transcript, setTranscript] = useState<TranscriptResponse["transcriptSegments"]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      try {
        const state = await window.scope?.getOverlayState?.();
        if (!cancelled) {
          setOverlayState(state ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      }
    };

    void loadState();
    const stateTimer = window.setInterval(() => {
      void loadState();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(stateTimer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!overlayState?.interviewId) {
      setTranscript([]);
      return;
    }

    let cancelled = false;

    const pollTranscript = async () => {
      try {
        const serviceBaseUrl = await window.scope?.getServiceBaseUrl?.();
        const token = await window.scope?.getServiceToken?.();
        if (!serviceBaseUrl || !token) {
          return;
        }

        const response = await fetch(`${serviceBaseUrl}/v1/interviews/${encodeURIComponent(overlayState.interviewId)}/transcript`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = (await response.json().catch(() => ({}))) as TranscriptResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load transcript.");
        }
        if (!cancelled) {
          setTranscript(data.transcriptSegments ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      }
    };

    void pollTranscript();
    const timer = window.setInterval(() => {
      void pollTranscript();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [overlayState?.interviewId]);

  const recentTranscript = useMemo(() => transcript.slice(-5).reverse(), [transcript]);

  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "linear-gradient(180deg, #102a43 0%, #0b1f33 100%)",
        color: "#f0f4f8"
      }}
    >
      <section
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 18,
          padding: 16,
          background: "rgba(11, 31, 51, 0.88)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.28)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9fb3c8" }}>
              Scope Recording
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: 20 }}>{overlayState?.title ?? "Waiting for session"}</h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                color: "#7fd1b9"
              }}
            >
              {overlayState?.confidence ?? "idle"}
            </div>
            <div style={{ fontSize: 28, fontVariantNumeric: "tabular-nums" }}>
              {overlayState ? formatElapsed(overlayState.startedAt, nowMs) : "00:00"}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {recentTranscript.length > 0 ? (
            recentTranscript.map((segment) => (
              <div
                key={segment.id}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  fontSize: 13,
                  lineHeight: 1.45
                }}
              >
                <strong style={{ textTransform: "capitalize" }}>{segment.speaker}:</strong> {segment.text}
              </div>
            ))
          ) : (
            <div style={{ color: "#bcccdc", fontSize: 13 }}>Transcript will appear here once audio starts flowing.</div>
          )}
        </div>

        <button
          style={{
            marginTop: 16,
            width: "100%",
            border: 0,
            borderRadius: 12,
            padding: "12px 14px",
            background: "#d64545",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer"
          }}
          onClick={async () => {
            try {
              await window.scope?.stopOverlaySession?.();
              window.close();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          Stop Recording
        </button>

        {error ? <p style={{ marginTop: 12, color: "#ffb3b3", fontSize: 12 }}>{error}</p> : null}
      </section>
    </main>
  );
}
