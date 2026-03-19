import type { MeetingCandidate } from "./calendarSync";

export interface ActiveMeetingSession {
  interviewId: string;
  title: string;
  confidence: "low" | "medium" | "high";
  startedAt: string;
}

export class MeetingCoordinator {
  private lastPromptKey: string | null = null;
  private activeSession: ActiveMeetingSession | null = null;
  private prompting = false;

  constructor(
    private readonly deps: {
      promptUser: (candidate: MeetingCandidate) => Promise<boolean>;
      startSession: (candidate: MeetingCandidate) => Promise<ActiveMeetingSession>;
      onSessionStarted?: (session: ActiveMeetingSession) => void;
      onSessionStopped?: () => void;
    }
  ) {}

  getActiveSession() {
    return this.activeSession;
  }

  markSessionStopped() {
    this.activeSession = null;
    this.deps.onSessionStopped?.();
  }

  async considerCandidate(candidate: MeetingCandidate | null) {
    if (!candidate || candidate.confidence === "low" || this.activeSession || this.prompting) {
      if (!candidate) {
        this.lastPromptKey = null;
      }
      return false;
    }

    if (candidate.key === this.lastPromptKey) {
      return false;
    }

    this.lastPromptKey = candidate.key;
    this.prompting = true;
    try {
      const confirmed = await this.deps.promptUser(candidate);
      if (!confirmed) {
        return false;
      }

      this.activeSession = await this.deps.startSession(candidate);
      this.deps.onSessionStarted?.(this.activeSession);
      return true;
    } catch (error) {
      this.lastPromptKey = null;
      throw error;
    } finally {
      this.prompting = false;
    }
  }
}
