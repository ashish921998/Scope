import type { MeetingNotes, MeetingSession, MeetingTranscriptSegment } from "@scope/types";
import { MeetingRepo } from "../db/meetingRepo";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const buildMeetingNotes = (segments: MeetingTranscriptSegment[]): MeetingNotes => {
  const lines = segments.map((segment) => segment.text.trim()).filter(Boolean);
  const lowered = lines.map((line) => line.toLowerCase());

  const decisions = lines.filter((line) => /decid|agreed|will|ship|launch/i.test(line)).slice(0, 3);
  const actionLines = lines.filter((line) => /follow up|next step|action|todo|owner/i.test(line)).slice(0, 3);
  const topics = unique(
    lowered.flatMap((line) => {
      const matched: string[] = [];
      if (line.includes("onboarding")) matched.push("Onboarding");
      if (line.includes("integration")) matched.push("Integrations");
      if (line.includes("permission")) matched.push("Permissions");
      if (line.includes("transcript")) matched.push("Transcription");
      if (line.includes("notes")) matched.push("Notes");
      return matched;
    })
  ).slice(0, 4);

  return {
    summary: lines[0] ?? "Meeting completed with no transcript captured.",
    keyDecisions: decisions.length > 0 ? decisions : lines.slice(0, 3),
    actionItems:
      actionLines.length > 0
        ? actionLines.map((text, index) => ({
            text,
            sourceSegmentIds: segments[index] ? [segments[index].id] : undefined
          }))
        : lines.slice(0, 2).map((text, index) => ({
            text: `Follow up on: ${text}`,
            sourceSegmentIds: segments[index] ? [segments[index].id] : undefined
          })),
    topics: topics.length > 0 ? topics : ["General"],
    followUps: unique(
      lines.filter((line) => /question|clarify|confirm|follow up|next/i.test(line)).slice(0, 3)
    )
  };
};

export class MeetingService {
  constructor(private readonly meetingRepo: MeetingRepo) {}

  start(consentAccepted: boolean, title = "New meeting"): MeetingSession {
    if (!consentAccepted) {
      throw new Error("Recording consent is required before starting capture.");
    }

    const session: MeetingSession = {
      id: newId(),
      title,
      status: "active",
      consentAccepted,
      startedAt: nowIso(),
      transcriptSegments: []
    };

    return this.meetingRepo.create(session);
  }

  appendTranscript(sessionId: string, segments: MeetingTranscriptSegment[]) {
    const session = this.meetingRepo.get(sessionId);
    if (!session) {
      throw new Error("Meeting session not found.");
    }

    const merged = [...session.transcriptSegments, ...segments].sort((a, b) => a.timestampMs - b.timestampMs);
    this.meetingRepo.updateTranscript(sessionId, merged);

    return {
      meetingId: sessionId,
      transcriptSegments: merged
    };
  }

  get(sessionId: string) {
    const session = this.meetingRepo.get(sessionId);
    if (!session) {
      throw new Error("Meeting session not found.");
    }
    return session;
  }

  getTranscript(sessionId: string) {
    const session = this.get(sessionId);
    return {
      meetingId: session.id,
      status: session.status,
      transcriptSegments: session.transcriptSegments,
      notes: session.notes
    };
  }

  listRecent(limit = 5) {
    return this.meetingRepo.listRecent(limit);
  }

  stop(sessionId: string) {
    const session = this.get(sessionId);
    const notes = buildMeetingNotes(session.transcriptSegments);
    this.meetingRepo.complete(sessionId, notes, nowIso());
    return this.get(sessionId);
  }
}
