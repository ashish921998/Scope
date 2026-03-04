import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { CaptureService } from "./audio/captureService";
import { registerIpcHandlers } from "./ipc/registerIpc";
import { KeychainStore } from "./security/keychain";
import { startLocalService } from "./service/server";

let mainWindow: BrowserWindow | null = null;

const createWindow = async () => {
  const userData = app.getPath("userData");
  const dbPath = join(userData, "data", "scope.db");

  const keychainStore = new KeychainStore();
  const captureService = new CaptureService();
  const localService = await startLocalService({ dbPath, keychainStore, port: 4010 });

  registerIpcHandlers({
    captureService,
    keychainStore,
    servicePort: localService.port
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.RENDERER_URL ?? "http://127.0.0.1:3000";
  await mainWindow.loadURL(rendererUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  app.on("before-quit", async () => {
    await localService.close();
  });
};

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error("Failed to start desktop app", error);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
