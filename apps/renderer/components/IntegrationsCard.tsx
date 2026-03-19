"use client";

import { useState } from "react";
import { fetchJson } from "../lib/api";

export interface IntegrationsCardProps {
  setOutput: (output: string) => void;
}

export function IntegrationsCard({ setOutput }: IntegrationsCardProps) {
  const [slackChannelId, setSlackChannelId] = useState("");
  const [linearTeamId, setLinearTeamId] = useState("");
  const [posthogProjectId, setPosthogProjectId] = useState("");

  return (
    <section className="card">
      <h2>Integrations</h2>
      <label>
        Slack Channel ID
        <input value={slackChannelId} onChange={(e) => setSlackChannelId(e.target.value)} placeholder="C..." />
      </label>
      <label>
        Linear Team ID (optional)
        <input value={linearTeamId} onChange={(e) => setLinearTeamId(e.target.value)} placeholder="team-id" />
      </label>
      <label>
        PostHog Project ID
        <input value={posthogProjectId} onChange={(e) => setPosthogProjectId(e.target.value)} placeholder="2" />
      </label>
      <button
        className="secondary"
        onClick={async () => {
          if (!window.scope) {
            throw new Error("Desktop IPC bridge unavailable. Run in Electron desktop app.");
          }
          const result = await window.scope.connectIntegration("slack");
          setOutput(JSON.stringify(result, null, 2));
        }}
      >
        Connect Slack OAuth
      </button>
      <button
        className="secondary"
        onClick={async () => {
          if (!window.scope) {
            throw new Error("Desktop IPC bridge unavailable. Run in Electron desktop app.");
          }
          const result = await window.scope.connectIntegration("linear");
          setOutput(JSON.stringify(result, null, 2));
        }}
      >
        Connect Linear OAuth
      </button>
      <button
        className="secondary"
        onClick={async () => {
          if (!window.scope) {
            throw new Error("Desktop IPC bridge unavailable. Run in Electron desktop app.");
          }
          const result = await window.scope.connectIntegration("google_calendar");
          setOutput(JSON.stringify(result, null, 2));
        }}
      >
        Connect Google Calendar
      </button>
      <button
        className="secondary"
        onClick={async () => {
          const result = await fetchJson("/v1/integrations/sync", {
            method: "POST",
            body: JSON.stringify({
              providers: ["slack", "linear", "posthog"],
              slack: { channelId: slackChannelId || undefined, limit: 50 },
              linear: { teamId: linearTeamId || undefined, limit: 50 },
              posthog: { projectId: posthogProjectId || undefined, limit: 50 }
            })
          });
          setOutput(JSON.stringify(result, null, 2));
        }}
      >
        Sync Slack + Linear + PostHog
      </button>
    </section>
  );
}
