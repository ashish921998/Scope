import type { InterviewDebrief, InterviewSession, TranscriptSegment } from "@scope/types";
import { InterviewRepo } from "../db/interviewRepo";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";

const buildFollowups = (segments: TranscriptSegment[]) => {
  const latest = segments.slice(-5).map((segment) => segment.text.toLowerCase());
  const followups: string[] = [];

  if (latest.some((line) => line.includes("manual") || line.includes("slow"))) {
    followups.push("Can you walk me through the exact step that feels most manual?");
  }

  if (latest.some((line) => line.includes("error") || line.includes("fail") || line.includes("bug"))) {
    followups.push("How often does this issue happen, and what is the business impact?");
  }

  if (latest.some((line) => line.includes("wish") || line.includes("need"))) {
    followups.push("If this feature existed today, what workflow would it unblock?");
  }

  return followups.slice(0, 3);
};

const buildDebrief = (segments: TranscriptSegment[]): InterviewDebrief => {
  const text = segments.map((segment) => segment.text);
  const pain = text.filter((line) => /slow|frustrating|hard|pain|manual/i.test(line)).slice(0, 4);
  const validations = text.filter((line) => /love|great|useful|need|wish/i.test(line)).slice(0, 4);

  return {
    keyTakeaways: text.slice(0, 5),
    actionItems: ["Prioritize top pain points in signal stream", "Validate request frequency with additional calls"],
    painPoints: pain.map((line) => ({
      title: line,
      severity: /critical|blocked|cannot/i.test(line) ? "high" : "medium",
      evidence: line
    })),
    featureValidations: validations.map((line) => ({
      feature: line,
      evidence: line
    })),
    knowledgeGaps: ["Missing quantified frequency for pain points", "Need segmentation by customer size"],
    risks: ["Single-call bias if sample size is low"],
    nextSteps: ["Run follow-up interviews", "Cross-check with product analytics"]
  };
};

export class InterviewService {
  constructor(private readonly interviewRepo: InterviewRepo) {}

  start(consentAccepted: boolean): InterviewSession {
    if (!consentAccepted) {
      throw new Error("Recording consent is required before starting capture.");
    }

    const session: InterviewSession = {
      id: newId(),
      status: "active",
      consentAccepted,
      startedAt: nowIso(),
      transcriptSegments: [],
      followups: []
    };

    return this.interviewRepo.create(session);
  }

  appendTranscript(sessionId: string, segments: TranscriptSegment[]) {
    const session = this.interviewRepo.get(sessionId);
    if (!session) {
      throw new Error("Interview session not found.");
    }

    const merged = [...session.transcriptSegments, ...segments].sort((a, b) => a.timestampMs - b.timestampMs);
    const followups = buildFollowups(merged);
    this.interviewRepo.updateTranscript(sessionId, merged, followups);

    return {
      transcriptSegments: merged,
      followups
    };
  }

  stop(sessionId: string) {
    const session = this.interviewRepo.get(sessionId);
    if (!session) {
      throw new Error("Interview session not found.");
    }

    const debrief = buildDebrief(session.transcriptSegments);
    this.interviewRepo.complete(sessionId, debrief, nowIso());

    return this.interviewRepo.get(sessionId);
  }

  getTranscript(sessionId: string) {
    const session = this.interviewRepo.get(sessionId);
    if (!session) {
      throw new Error("Interview session not found.");
    }
    return {
      interviewId: session.id,
      status: session.status,
      transcriptSegments: session.transcriptSegments,
      followups: session.followups,
      debrief7: session.debrief7
    };
  }
}
