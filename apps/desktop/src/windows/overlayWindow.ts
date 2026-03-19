import { BrowserWindow } from "electron";
import type { ActiveMeetingSession } from "../meetings/coordinator";

export interface OverlayWindowState extends ActiveMeetingSession {
  visible: boolean;
}

export class OverlayWindowController {
  private window: BrowserWindow | null = null;
  private state: OverlayWindowState | null = null;

  constructor(
    private readonly deps: {
      createWindow?: () => BrowserWindow;
      loadOverlay: (window: BrowserWindow, session: ActiveMeetingSession) => Promise<void>;
      preloadPath?: string;
    }
  ) {}

  async open(session: ActiveMeetingSession) {
    const win =
      this.window && !this.window.isDestroyed()
        ? this.window
        : (this.deps.createWindow?.() ??
          new BrowserWindow({
            width: 420,
            height: 280,
            frame: false,
            transparent: false,
            resizable: false,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            title: "Scope Overlay",
            webPreferences: {
              preload: this.deps.preloadPath,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true
            }
          }));

    this.window = win;
    win.removeAllListeners("closed");
    win.on("closed", () => {
      this.window = null;
      this.state = null;
    });

    await this.deps.loadOverlay(win, session);
    this.state = {
      ...session,
      visible: true
    };
    win.showInactive();
  }

  close() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
    this.state = null;
  }

  getState() {
    return this.state ? { ...this.state } : null;
  }
}
