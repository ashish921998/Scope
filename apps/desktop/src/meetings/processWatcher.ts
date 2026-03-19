import { execFile } from "node:child_process";

export type MeetingProcessProvider = "zoom" | "teams";

export interface MeetingProcessPresence {
  provider: MeetingProcessProvider;
  processName: string;
  command: string;
}

export const parseProcessList = (stdout: string): MeetingProcessPresence[] => {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const seen = new Set<MeetingProcessProvider>();
  const matches: MeetingProcessPresence[] = [];

  for (const line of lines) {
    const normalized = line.toLowerCase();
    if (!seen.has("zoom") && (normalized.includes("/zoom.us") || normalized.endsWith("/zoom") || normalized === "zoom")) {
      seen.add("zoom");
      matches.push({
        provider: "zoom",
        processName: "Zoom",
        command: line
      });
      continue;
    }

    if (
      !seen.has("teams") &&
      (normalized.includes("microsoft teams") || normalized.endsWith("/teams") || normalized.endsWith("/teams.app/contents/macos/teams"))
    ) {
      seen.add("teams");
      matches.push({
        provider: "teams",
        processName: "Microsoft Teams",
        command: line
      });
    }
  }

  return matches;
};

export const listMeetingProcesses = async (): Promise<MeetingProcessPresence[]> =>
  new Promise((resolve, reject) => {
    execFile("ps", ["-ax", "-o", "comm="], (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(parseProcessList(stdout));
    });
  });

export class MeetingProcessWatcher {
  private timer: NodeJS.Timeout | null = null;
  private snapshot: MeetingProcessPresence[] = [];

  constructor(
    private readonly deps: {
      pollMs?: number;
      listProcesses?: () => Promise<MeetingProcessPresence[]>;
      onUpdate?: (processes: MeetingProcessPresence[]) => void;
      onError?: (error: unknown) => void;
    } = {}
  ) {}

  start() {
    if (this.timer) {
      return;
    }

    const run = async () => {
      try {
        this.snapshot = await (this.deps.listProcesses ?? listMeetingProcesses)();
        this.deps.onUpdate?.(this.snapshot);
      } catch (error) {
        this.deps.onError?.(error);
      }
    };

    void run();
    this.timer = setInterval(() => {
      void run();
    }, this.deps.pollMs ?? 10_000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSnapshot() {
    return [...this.snapshot];
  }
}
