import { MeetingCoordinator } from "../../apps/desktop/src/meetings/coordinator";
import type { MeetingCandidate } from "../../apps/desktop/src/meetings/calendarSync";

const candidate: MeetingCandidate = {
  key: "teams:evt-1:high",
  confidence: "high",
  process: {
    provider: "teams",
    processName: "Microsoft Teams",
    command: "Teams"
  },
  title: "Customer sync",
  event: {
    id: "evt-1",
    title: "Customer sync",
    startAt: "2026-03-19T09:55:00.000Z",
    endAt: "2026-03-19T10:30:00.000Z",
    attendees: []
  }
};

describe("meeting coordinator", () => {
  it("does not start automatically on low confidence", async () => {
    const promptUser = vi.fn(async () => true);
    const startSession = vi.fn(async () => ({
      interviewId: "int-1",
      title: "Meeting",
      confidence: "low" as const,
      startedAt: new Date().toISOString()
    }));
    const coordinator = new MeetingCoordinator({ promptUser, startSession });

    await coordinator.considerCandidate({ ...candidate, key: "process:teams", confidence: "low", event: undefined });

    expect(promptUser).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it("starts only after explicit confirmation", async () => {
    const promptUser = vi.fn(async () => true);
    const startSession = vi.fn(async () => ({
      interviewId: "int-1",
      title: candidate.title,
      confidence: candidate.confidence,
      startedAt: new Date().toISOString()
    }));
    const coordinator = new MeetingCoordinator({ promptUser, startSession });

    const result = await coordinator.considerCandidate(candidate);

    expect(result).toBe(true);
    expect(promptUser).toHaveBeenCalledOnce();
    expect(startSession).toHaveBeenCalledOnce();
    expect(coordinator.getActiveSession()?.interviewId).toBe("int-1");
  });

  it("leaves no active session when dismissed", async () => {
    const promptUser = vi.fn(async () => false);
    const startSession = vi.fn();
    const coordinator = new MeetingCoordinator({ promptUser, startSession: startSession as never });

    const result = await coordinator.considerCandidate(candidate);

    expect(result).toBe(false);
    expect(startSession).not.toHaveBeenCalled();
    expect(coordinator.getActiveSession()).toBeNull();
  });
});
