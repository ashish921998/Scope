import type { MeetingSession, TranscriptSegment } from "@scope/types";
import { MeetingRepo } from "../db/meetingRepo";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";
import { generateMeetingNotes } from "./notesPipeline";

export class MeetingService {
  constructor(
    private readonly meetingRepo: MeetingRepo,
    private readonly getAnthropicKey?: () => Promise<string | null>
  ) {}

  start(): MeetingSession {
    const session: MeetingSession = {
      id: newId(),
      status: "active",
      startedAt: nowIso(),
      transcriptSegments: []
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

    const merged = [...session.transcriptSegments, ...segments].sort((a, b) => a.timestampMs - b.timestampMs);
    this.meetingRepo.updateTranscript(sessionId, merged);

    return {
      transcriptSegments: merged
    };
  }

  async stop(sessionId: string) {
    const session = this.meetingRepo.get(sessionId);
    if (!session) {
      throw new Error("Meeting session not found.");
    }

    const anthropicKey = this.getAnthropicKey ? await this.getAnthropicKey().catch(() => null) : null;
    const notes = await generateMeetingNotes(session.transcriptSegments, anthropicKey);
    this.meetingRepo.complete(sessionId, notes, nowIso());

    return this.get(sessionId);
  }

  get(sessionId: string) {
    const session = this.meetingRepo.get(sessionId);
    if (!session) {
      throw new Error("Meeting session not found.");
    }
    return session;
  }

  list() {
    return this.meetingRepo.list();
  }
}
