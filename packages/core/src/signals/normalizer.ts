import type { SignalIngestInput, SignalSource } from "@scope/types";

const sourceAliases: Record<string, SignalSource> = {
  slack: "slack",
  linear: "linear",
  github: "github",
  posthog: "posthog",
  notion: "notion",
  jira: "jira",
  google: "google",
  interview: "interview",
  meeting: "meeting",
  research: "research_upload",
  upload: "research_upload"
};

export const normalizeSource = (rawSource: string): SignalSource => {
  const normalized = sourceAliases[rawSource.toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported source: ${rawSource}`);
  }
  return normalized;
};

export const normalizeSignalInput = (input: SignalIngestInput): SignalIngestInput => ({
  ...input,
  source: normalizeSource(input.source),
  text: input.text.trim(),
  sourceRef: input.sourceRef.trim()
});
