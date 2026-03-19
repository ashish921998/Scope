import { beforeEach, describe, expect, it, vi } from "vitest";

const getMediaAccessStatus = vi.fn();
const handle = vi.fn();

vi.mock("electron", () => ({
  systemPreferences: {
    getMediaAccessStatus
  },
  ipcMain: {
    handle
  }
}));

describe("media permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a stable shared permission shape", async () => {
    getMediaAccessStatus.mockImplementation((kind: string) => (kind === "microphone" ? "granted" : "denied"));
    const { getMediaPermissionStatus } = await import("../../apps/desktop/src/permissions/mediaPermissions");
    const status = getMediaPermissionStatus();

    expect(status).toHaveProperty("microphone");
    expect(status).toHaveProperty("screen");
    expect(["granted", "denied", "restricted", "not-determined", "unsupported"]).toContain(status.microphone);
    expect(["granted", "denied", "restricted", "not-determined", "unsupported"]).toContain(status.screen);
  });

  it("registers an IPC handler for permission queries", async () => {
    const { registerIpcHandlers } = await import("../../apps/desktop/src/ipc/registerIpc");

    registerIpcHandlers({
      captureService: {} as never,
      getMediaPermissionStatus: () => ({ microphone: "granted", screen: "not-determined" }),
      keychainStore: {} as never,
      servicePort: 4010,
      serviceToken: "token",
      rendererUrl: "http://127.0.0.1:3000"
    });

    const mediaCall = handle.mock.calls.find((call) => call[0] === "media/getPermissions");
    expect(mediaCall).toBeTruthy();

    const result = await mediaCall?.[1]({
      senderFrame: {
        url: "http://127.0.0.1:3000/"
      }
    });

    expect(result).toEqual({
      microphone: "granted",
      screen: "not-determined"
    });
  });
});
