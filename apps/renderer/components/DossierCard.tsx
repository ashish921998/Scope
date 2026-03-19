"use client";

import { useState } from "react";
import { fetchJson } from "../lib/api";

export interface DossierCardProps {
  featureId: string;
  setFeatureId: (id: string) => void;
  setOutput: (output: string) => void;
}

export function DossierCard({ featureId, setFeatureId, setOutput }: DossierCardProps) {
  const [dossierId, setDossierId] = useState("");

  return (
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
  );
}
