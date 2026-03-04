"use client";

import { useMemo, useState } from "react";

const API = "http://127.0.0.1:4010";

const fetchJson = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? JSON.stringify(data));
  }
  return data;
};

export default function Home() {
  const [consent, setConsent] = useState(true);
  const [interviewId, setInterviewId] = useState("");
  const [transcriptText, setTranscriptText] = useState("Customer says onboarding feels manual and slow.");
  const [signalSource, setSignalSource] = useState("slack");
  const [signalRef, setSignalRef] = useState("msg-1");
  const [signalText, setSignalText] = useState("Users request CSV import and report frequent onboarding confusion.");
  const [featureId, setFeatureId] = useState("");
  const [dossierId, setDossierId] = useState("");
  const [output, setOutput] = useState("Ready.");

  const transcriptSegments = useMemo(
    () => [
      {
        id: crypto.randomUUID(),
        speaker: "customer",
        text: transcriptText,
        timestampMs: Date.now()
      }
    ],
    [transcriptText]
  );

  return (
    <main>
      <h1>Scope Desktop</h1>
      <small>Arena-equivalent local-first workflow for interviews, signals, and dossiers.</small>

      <div className="grid">
        <section className="card">
          <h2>Interview Copilot</h2>
          <label>
            Consent Accepted
            <select value={consent ? "yes" : "no"} onChange={(e) => setConsent(e.target.value === "yes")}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <button
            onClick={async () => {
              const session = await fetchJson("/v1/interviews/start", {
                method: "POST",
                body: JSON.stringify({ consentAccepted: consent })
              });
              setInterviewId(session.id);
              setOutput(JSON.stringify(session, null, 2));
            }}
          >
            Start Interview
          </button>
          <label>
            Transcript Segment
            <textarea value={transcriptText} onChange={(e) => setTranscriptText(e.target.value)} />
          </label>
          <button
            className="secondary"
            onClick={async () => {
              if (!interviewId) {
                throw new Error("Start interview first.");
              }

              const result = await fetchJson(`/v1/interviews/${interviewId}/transcript`, {
                method: "POST",
                body: JSON.stringify({ segments: transcriptSegments })
              });
              setOutput(JSON.stringify(result, null, 2));
            }}
          >
            Append Transcript
          </button>
          <button
            className="secondary"
            onClick={async () => {
              if (!interviewId) {
                throw new Error("Start interview first.");
              }
              const result = await fetchJson(`/v1/interviews/${interviewId}/stop`, {
                method: "POST",
                body: JSON.stringify({})
              });
              setOutput(JSON.stringify(result, null, 2));
            }}
          >
            Stop + Debrief
          </button>
        </section>

        <section className="card">
          <h2>Signal Stream</h2>
          <label>
            Source
            <select value={signalSource} onChange={(e) => setSignalSource(e.target.value)}>
              <option value="slack">Slack</option>
              <option value="linear">Linear</option>
              <option value="posthog">PostHog</option>
              <option value="interview">Interview</option>
            </select>
          </label>
          <label>
            Source Ref
            <input value={signalRef} onChange={(e) => setSignalRef(e.target.value)} />
          </label>
          <label>
            Signal Text
            <textarea value={signalText} onChange={(e) => setSignalText(e.target.value)} />
          </label>
          <button
            onClick={async () => {
              const result = await fetchJson("/v1/signals/ingest", {
                method: "POST",
                body: JSON.stringify({
                  source: signalSource,
                  sourceRef: signalRef,
                  text: signalText
                })
              });
              setOutput(JSON.stringify(result, null, 2));
            }}
          >
            Ingest Signal
          </button>
          <button
            className="secondary"
            onClick={async () => {
              const result = await fetchJson("/v1/signals/stream");
              setOutput(JSON.stringify(result, null, 2));
            }}
          >
            Refresh Stream
          </button>
          <button
            className="secondary"
            onClick={async () => {
              const result = await fetchJson("/v1/features/ghost/scan", {
                method: "POST",
                body: JSON.stringify({})
              });
              if (result.candidates?.[0]?.id) {
                setFeatureId(result.candidates[0].id);
              }
              setOutput(JSON.stringify(result, null, 2));
            }}
          >
            Scan Ghost Features
          </button>
        </section>

        <section className="card">
          <h2>Feature Dossier</h2>
          <label>
            Feature ID
            <input value={featureId} onChange={(e) => setFeatureId(e.target.value)} />
          </label>
          <button
            onClick={async () => {
              const dossier = await fetchJson("/v1/dossiers/generate", {
                method: "POST",
                body: JSON.stringify({ featureId })
              });
              setDossierId(dossier.id);
              setOutput(JSON.stringify(dossier, null, 2));
            }}
          >
            Generate 9-Section Dossier
          </button>
          <label>
            Dossier ID
            <input value={dossierId} onChange={(e) => setDossierId(e.target.value)} />
          </label>
          <button
            className="secondary"
            onClick={async () => {
              const result = await fetchJson("/v1/export/dossier", {
                method: "POST",
                body: JSON.stringify({ featureId, dossierId, format: "markdown" })
              });
              setOutput(result.content);
            }}
          >
            Export Markdown
          </button>
          <button
            className="secondary"
            onClick={async () => {
              const result = await fetchJson("/v1/export/dossier", {
                method: "POST",
                body: JSON.stringify({ featureId, dossierId, format: "json" })
              });
              setOutput(result.content);
            }}
          >
            Export JSON
          </button>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Output</h3>
        <pre>{output}</pre>
      </section>
    </main>
  );
}
