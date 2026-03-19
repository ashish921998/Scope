"use client";

import { useState } from "react";
import { fetchJson } from "../lib/api";

export interface SignalStreamCardProps {
  setOutput: (output: string) => void;
  onFeatureIdFound: (id: string) => void;
}

export function SignalStreamCard({ setOutput, onFeatureIdFound }: SignalStreamCardProps) {
  const [signalSource, setSignalSource] = useState("slack");
  const [signalRef, setSignalRef] = useState("msg-1");
  const [signalText, setSignalText] = useState("Users request CSV import and report frequent onboarding confusion.");

  return (
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
            onFeatureIdFound(result.candidates[0].id);
          }
          setOutput(JSON.stringify(result, null, 2));
        }}
      >
        Scan Ghost Features
      </button>
    </section>
  );
}
