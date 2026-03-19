import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { CaptureService } from "./audio/captureService";
import { registerIpcHandlers } from "./ipc/registerIpc";
import { KeychainStore } from "./security/keychain";
import { startLocalService } from "./service/server";
import { type AppLogger, createAppLogger, resolveDefaultLogPath } from "./telemetry/logger";
import { flushSentryTelemetry, initSentryTelemetry } from "./telemetry/sentry";

let mainWindow: BrowserWindow | null = null;
let localServiceCloser: (() => Promise<void>) | null = null;

const createWindow = async (logger: AppLogger) => {
  const userData = app.getPath("userData");
  const dbPath = join(userData, "data", "scope.db");
  const rendererUrl = app.isPackaged
    ? process.env.RENDERER_URL?.trim() || null
    : process.env.RENDERER_URL?.trim() || "http://127.0.0.1:3000";
  const packagedRendererPath = join(import.meta.dirname, "renderer", "index.html");
  const logFilePath = resolveDefaultLogPath(userData);
  const servicePort = Number(process.env.SCOPE_LOCAL_SERVICE_PORT ?? "4010");

  const keychainStore = new KeychainStore();
  const dbEncryptionKey = await keychainStore.getOrCreateDatabaseKey();
  const localService = await startLocalService({
    dbPath,
    keychainStore,
    dbEncryptionKey,
    dbEncryptionRequired: process.env.SCOPE_DB_ENCRYPTION_REQUIRED === "true",
    dbCipher: process.env.SCOPE_DB_CIPHER ?? "sqlcipher",
    diagnosticsLogPath: logFilePath,
    port: servicePort,
    logger
  });
  localServiceCloser = localService.close;
  logger.info("Local service started", {
    port: localService.port,
    dbPath
  });
  const captureService = new CaptureService(`http://127.0.0.1:${localService.port}`);

  registerIpcHandlers({
    captureService,
    keychainStore,
    servicePort: localService.port,
    serviceToken: localService.serviceToken,
    rendererUrl: rendererUrl ?? `file://${packagedRendererPath}`
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(packagedRendererPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

};

app.whenReady().then(() => {
  const userData = app.getPath("userData");
  const logger = createAppLogger(resolveDefaultLogPath(userData));
  const sentry = initSentryTelemetry({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    release: `scope-desktop@${app.getVersion()}`
  });
  logger.info("Telemetry initialized", {
    sentryEnabled: sentry.enabled
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error });
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason });
  });

  createWindow(logger).catch((error) => {
    logger.error("Failed to start desktop app", { error });
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(logger);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("render-process-gone", (_event, _webContents, details) => {
  const logger = createAppLogger(resolveDefaultLogPath(app.getPath("userData")));
  logger.error("Renderer process crashed", { details });
});

app.on("before-quit", async () => {
  if (!localServiceCloser) {
    await flushSentryTelemetry();
    return;
  }
  try {
    await localServiceCloser();
  } catch {
    // noop: this is best-effort during shutdown and is already logged elsewhere.
  } finally {
    localServiceCloser = null;
    await flushSentryTelemetry();
  }
});
