import type { MeetingNotes, MeetingParticipant, MeetingSession, TranscriptSegment } from "@scope/types";
import { MeetingRepo } from "../db/meetingRepo";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";

const buildDefaultNotes = (segments: TranscriptSegment[]): MeetingNotes => {
  const latest = segments.slice(-5).map((segment) => segment.text);

  return {
    summary: latest.join(" ").trim() || "Meeting completed with no transcript notes generated.",
    keyDecisions: [],
    actionItems: [],
    topics: [],
    followUps: []
  };
};

export interface StartMeetingInput {
  title?: string;
  platform?: string;
  participants?: MeetingParticipant[];
  calendarEventId?: string;
}

export class MeetingService {
  constructor(private readonly meetingRepo: MeetingRepo) {}

  start(input: StartMeetingInput = {}): MeetingSession {
    const session: MeetingSession = {
      id: newId(),
      title: input.title?.trim() || "Untitled meeting",
      status: "active",
      platform: input.platform,
      startedAt: nowIso(),
      participants: input.participants ?? [],
      transcriptSegments: [],
      calendarEventId: input.calendarEventId
    };

    return this.meetingRepo.create(session);
  }

  appendTranscript(sessionId: string, segments: TranscriptSegment[]) {
    const session = this.meetingRepo.get(sessionId);
    if (!session) {
      throw new Error("Meeting session not found.");
    }
    if (session.status === "completed") {
      throw new Error("Meeting session already completed.");
    }

    const mergedById = new Map(session.transcriptSegments.map((segment) => [segment.id, segment]));
    for (const segment of segments) {
      mergedById.set(segment.id, segment);
    }
    const merged = [...mergedById.values()].sort((a, b) => a.timestampMs - b.timestampMs);
    this.meetingRepo.updateTranscript(sessionId, merged);

    return {
      transcriptSegments: merged
    };
  }

  updateNotes(sessionId: string, notes: MeetingNotes) {
    const session = this.meetingRepo.get(sessionId);
    if (!session) {
      throw new Error("Meeting session not found.");
    }

    this.meetingRepo.updateNotes(sessionId, notes);
    return this.meetingRepo.get(sessionId);
  }

  stop(sessionId: string) {
    const current = this.meetingRepo.get(sessionId);
    if (!current) {
      throw new Error("Meeting session not found.");
    }

    if (current.status === "completed") {
      return current;
    }

    const endedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(current.startedAt));
    this.meetingRepo.complete(sessionId, endedAt, durationMs);

    const completed = this.meetingRepo.get(sessionId);
    if (completed && !completed.notes) {
      this.meetingRepo.updateNotes(sessionId, buildDefaultNotes(completed.transcriptSegments));
    }

    return this.meetingRepo.get(sessionId);
  }

  getTranscript(sessionId: string) {
    const session = this.meetingRepo.get(sessionId);
    if (!session) {
      throw new Error("Meeting session not found.");
    }

    return {
      meetingId: session.id,
      status: session.status,
      transcriptSegments: session.transcriptSegments,
      notes: session.notes
    };
  }
}
