"use client";

import { useState } from "react";
import { fetchJson } from "../lib/api";

export interface SupportCardProps {
  setOutput: (output: string) => void;
  registerTourTarget: (id: "supportEmail" | "supportNotes" | "supportSend") => (node: HTMLElement | null) => void;
}

export function SupportCard({ setOutput, registerTourTarget }: SupportCardProps) {
  const [diagnosticsEmail, setDiagnosticsEmail] = useState("");
  const [diagnosticsNotes, setDiagnosticsNotes] = useState("");
  const [includeDiagnosticsLogs, setIncludeDiagnosticsLogs] = useState(true);
  const [includeDiagnosticsHealth, setIncludeDiagnosticsHealth] = useState(true);
  const [includeDiagnosticsEmail, setIncludeDiagnosticsEmail] = useState(false);
  const [redactDiagnosticsLogs, setRedactDiagnosticsLogs] = useState(true);
  const [redactDiagnosticsContext, setRedactDiagnosticsContext] = useState(true);
  const [diagnosticsSending, setDiagnosticsSending] = useState(false);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  return (
    <section className="card">
      <h2>Support</h2>
      <label>
        Contact Email (optional)
        <input
          ref={registerTourTarget("supportEmail")}
          className="tour-target"
          value={diagnosticsEmail}
          onChange={(e) => setDiagnosticsEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </label>
      <label>
        Notes (optional)
        <textarea
          ref={registerTourTarget("supportNotes")}
          className="tour-target"
          value={diagnosticsNotes}
          onChange={(e) => setDiagnosticsNotes(e.target.value)}
          placeholder="What happened right before the issue?"
        />
      </label>
      <label>
        Include Log Tail
        <select
          value={includeDiagnosticsLogs ? "yes" : "no"}
          onChange={(e) => setIncludeDiagnosticsLogs(e.target.value === "yes")}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>
        Include Health Snapshot
        <select
          value={includeDiagnosticsHealth ? "yes" : "no"}
          onChange={(e) => setIncludeDiagnosticsHealth(e.target.value === "yes")}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>
        Include Contact Email
        <select
          value={includeDiagnosticsEmail ? "yes" : "no"}
          onChange={(e) => setIncludeDiagnosticsEmail(e.target.value === "yes")}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>
        Redact Log Contents
        <select
          value={redactDiagnosticsLogs ? "yes" : "no"}
          onChange={(e) => setRedactDiagnosticsLogs(e.target.value === "yes")}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>
        Redact Email/Notes
        <select
          value={redactDiagnosticsContext ? "yes" : "no"}
          onChange={(e) => setRedactDiagnosticsContext(e.target.value === "yes")}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <button
        className="secondary"
        onClick={async () => {
          const params = new URLSearchParams({
            includeLogs: String(includeDiagnosticsLogs),
            includeHealth: String(includeDiagnosticsHealth),
            includeEmail: String(includeDiagnosticsEmail),
            redactLogs: String(redactDiagnosticsLogs),
            redactUserContext: String(redactDiagnosticsContext)
          });
          const preview = await fetchJson(`/v1/support/diagnostics?${params.toString()}`);
          setOutput(JSON.stringify(preview, null, 2));
        }}
        disabled={diagnosticsSending}
      >
        Preview Diagnostics
      </button>
      <button
        ref={registerTourTarget("supportSend")}
        className="tour-target"
        disabled={diagnosticsSending}
        onClick={async () => {
          setDiagnosticsSending(true);
          setDiagnosticsStatus(null);
          try {
            const result = await fetchJson("/v1/support/diagnostics/send", {
              method: "POST",
              body: JSON.stringify({
                email: includeDiagnosticsEmail ? diagnosticsEmail || undefined : undefined,
                notes: diagnosticsNotes || undefined,
                maxLogLines: 500,
                includeLogs: includeDiagnosticsLogs,
                includeHealth: includeDiagnosticsHealth,
                includeEmail: includeDiagnosticsEmail,
                redactLogs: redactDiagnosticsLogs,
                redactUserContext: redactDiagnosticsContext
              })
            });
            setOutput(JSON.stringify(result, null, 2));
            const referenceId =
              typeof result.referenceId === "string" && result.referenceId.trim()
                ? ` Reference: ${result.referenceId}.`
                : "";
            setDiagnosticsStatus({
              type: "success",
              message: `Diagnostics sent successfully.${referenceId}`
            });
          } catch (error) {
            setDiagnosticsStatus({
              type: "error",
              message: error instanceof Error ? error.message : "Failed to send diagnostics."
            });
          } finally {
            setDiagnosticsSending(false);
          }
        }}
      >
        {diagnosticsSending ? "Sending Diagnostics..." : "Send Diagnostics"}
      </button>
      {diagnosticsStatus ? (
        <small style={{ color: diagnosticsStatus.type === "success" ? "green" : "crimson" }}>
          {diagnosticsStatus.message}
        </small>
      ) : null}
    </section>
  );
}
