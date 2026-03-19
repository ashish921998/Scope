import { parseProcessList } from "../../apps/desktop/src/meetings/processWatcher";

describe("meeting process watcher", () => {
  it("detects zoom and teams native processes only", () => {
    const result = parseProcessList(
      [
        "/Applications/zoom.us.app/Contents/MacOS/zoom.us",
        "/Applications/Microsoft Teams.app/Contents/MacOS/Teams",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      ].join("\n")
    );

    expect(result).toEqual([
      expect.objectContaining({ provider: "zoom" }),
      expect.objectContaining({ provider: "teams" })
    ]);
  });

  it("does not infer google meet from browser-only processes", () => {
    const result = parseProcessList(
      [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
      ].join("\n")
    );

    expect(result).toEqual([]);
  });
});
