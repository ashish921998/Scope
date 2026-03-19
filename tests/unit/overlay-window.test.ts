import { EventEmitter } from "node:events";
import { OverlayWindowController } from "../../apps/desktop/src/windows/overlayWindow";

class FakeBrowserWindow extends EventEmitter {
  destroyed = false;
  shown = false;

  isDestroyed() {
    return this.destroyed;
  }

  showInactive() {
    this.shown = true;
  }

  close() {
    this.destroyed = true;
    this.emit("closed");
  }
}

describe("overlay window controller", () => {
  it("opens only when a session is started and closes on stop", async () => {
    const window = new FakeBrowserWindow();
    const loadOverlay = vi.fn(async () => {});
    const controller = new OverlayWindowController({
      createWindow: () => window as never,
      loadOverlay,
      preloadPath: "/tmp/preload.js"
    });

    await controller.open({
      interviewId: "int-1",
      title: "Customer sync",
      confidence: "high",
      startedAt: "2026-03-19T10:00:00.000Z"
    });

    expect(loadOverlay).toHaveBeenCalledOnce();
    expect(window.shown).toBe(true);
    expect(controller.getState()).toEqual(
      expect.objectContaining({
        interviewId: "int-1",
        visible: true
      })
    );

    controller.close();
    expect(controller.getState()).toBeNull();
  });
});
