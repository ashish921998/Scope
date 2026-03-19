export type IntegrationProvider =
  | "slack"
  | "linear"
  | "github"
  | "google"
  | "posthog"
  | "notion"
  | "jira";

export type SignalType =
  | "pain_point"
  | "feature_request"
  | "bug"
  | "positive_feedback"
  | "analytics_insight";

export type SignalSource = IntegrationProvider | "interview" | "meeting" | "research_upload";

export type MediaPermissionState = "granted" | "denied" | "restricted" | "not-determined" | "unsupported";

export interface MediaPermissionStatus {
  microphone: MediaPermissionState;
  screen: MediaPermissionState;
}

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

export type MeetingStatus = "scheduled" | "active" | "completed" | "cancelled";

export type MeetingConsentState = "pending" | "granted" | "denied";

export interface TranscriptionSessionRef {
  provider: "openai";
  sessionId: string;
  transport: "realtime";
  startedAt: string;
  endedAt?: string;
}

export interface CalendarEvent {
  id: string;
  provider: Extract<IntegrationProvider, "google">;
  providerEventId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  attendees: Array<{ email?: string; name?: string; responseStatus?: string }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingNote {
  id: string;
  meetingId: string;
  kind: "summary" | "decision" | "action_item" | "observation";
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingSession {
  id: string;
  status: MeetingStatus;
  title: string;
  consentState: MeetingConsentState;
  startedAt?: string;
  endedAt?: string;
  calendarEventId?: string;
  transcriptionRef?: TranscriptionSessionRef;
  captureSource?: {
    source: "manual" | "calendar";
    systemAudio?: boolean;
    micDeviceId?: string;
  };
  noteIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
