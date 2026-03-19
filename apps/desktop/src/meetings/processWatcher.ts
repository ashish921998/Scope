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
  private running = false;
  private stopped = true;
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
    this.stopped = false;

    const run = async () => {
      if (this.stopped || this.running) {
        return;
      }
      this.running = true;
      try {
        const snapshot = await (this.deps.listProcesses ?? listMeetingProcesses)();
        if (!this.stopped) {
          this.snapshot = snapshot;
          this.deps.onUpdate?.(this.snapshot);
        }
      } catch (error) {
        if (!this.stopped) {
          this.deps.onError?.(error);
        }
      } finally {
        this.running = false;
        if (!this.stopped) {
          this.timer = setTimeout(() => {
            void run();
          }, this.deps.pollMs ?? 10_000);
        }
      }
    };

    void run();
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSnapshot() {
    return [...this.snapshot];
  }
}
