export type IntegrationProvider =
  | "slack"
  | "linear"
  | "github"
  | "posthog"
  | "notion"
  | "jira";

export type SignalType =
  | "pain_point"
  | "feature_request"
  | "bug"
  | "positive_feedback"
  | "analytics_insight";

export type SignalSource = IntegrationProvider | "interview" | "research_upload";

export interface EvidenceRef {
  id: string;
  kind: "transcript" | "message" | "issue" | "event" | "document";
  uri: string;
  quote: string;
  timestampMs?: number;
  signalId: string;
}

export interface Signal {
  id: string;
  source: SignalSource;
  sourceRef: string;
  type: SignalType;
  confidence: number;
  summary: string;
  evidenceRefs: EvidenceRef[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface TranscriptSegment {
  id: string;
  speaker: "interviewer" | "customer" | "system";
  text: string;
  timestampMs: number;
}

export interface InterviewDebrief {
  keyTakeaways: string[];
  actionItems: string[];
  painPoints: Array<{ title: string; severity: "low" | "medium" | "high"; evidence: string }>;
  featureValidations: Array<{ feature: string; evidence: string }>;
  knowledgeGaps: string[];
  risks: string[];
  nextSteps: string[];
}

export interface InterviewSession {
  id: string;
  status: "active" | "completed";
  transcriptSegments: TranscriptSegment[];
  followups: string[];
  debrief?: InterviewDebrief;
  consentAccepted: boolean;
  startedAt: string;
  endedAt?: string;
}

export interface FeatureCandidate {
  id: string;
  title: string;
  signalIds: string[];
  clusterScore: number;
  status: "suggested" | "accepted" | "rejected";
  createdAt: string;
}

export interface DossierSection {
  title:
    | "Problem"
    | "Research Summary"
    | "Solution"
    | "Technical Spec"
    | "UI/UX Spec"
    | "Impact Analysis"
    | "Risks"
    | "Alternatives"
    | "Acceptance Criteria";
  content: string;
}

export interface DossierCitation {
  signalId: string;
  evidenceId: string;
  quote: string;
}

export interface FeatureDossier {
  id: string;
  featureId: string;
  sections: DossierSection[];
  citations: DossierCitation[];
  criticNotes: string[];
  version: number;
  createdAt: string;
}

export interface SignalIngestInput {
  source: SignalSource;
  sourceRef: string;
  text: string;
  metadata?: Record<string, unknown>;
  evidenceUri?: string;
  evidenceKind?: EvidenceRef["kind"];
  timestampMs?: number;
}

export interface GhostScanResult {
  candidates: FeatureCandidate[];
  scannedSignals: number;
}

export interface ProviderKeyInput {
  provider: "openai" | "anthropic";
  key: string;
}

export interface DossierGenerateInput {
  featureId: string;
  signalIds?: string[];
}

export interface ExportInput {
  featureId: string;
  dossierId: string;
  format: "markdown" | "json";
  linearIssueId?: string;
}
