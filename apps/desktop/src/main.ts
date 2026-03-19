import { app, BrowserWindow, dialog } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CaptureService } from "./audio/captureService";
import { GoogleCalendarSync, findMeetingCandidate, type CalendarEvent, type MeetingCandidate } from "./meetings/calendarSync";
import { MeetingCoordinator } from "./meetings/coordinator";
import { MeetingProcessWatcher, type MeetingProcessPresence } from "./meetings/processWatcher";
import { registerIpcHandlers } from "./ipc/registerIpc";
import { KeychainStore } from "./security/keychain";
import { startLocalService } from "./service/server";
import { type AppLogger, createAppLogger, resolveDefaultLogPath } from "./telemetry/logger";
import { flushSentryTelemetry, initSentryTelemetry } from "./telemetry/sentry";
import { OverlayWindowController } from "./windows/overlayWindow";

let mainWindow: BrowserWindow | null = null;
let localServiceCloser: (() => Promise<void>) | null = null;
let processWatcher: MeetingProcessWatcher | null = null;
let calendarSync: GoogleCalendarSync | null = null;
let meetingCoordinator: MeetingCoordinator | null = null;
let overlayController: OverlayWindowController | null = null;
let captureService: CaptureService | null = null;

const resolveRendererLocation = (route: "/" | "/overlay", rendererUrl: string | null) => {
  const normalizedRoute = route === "/" ? "/" : "/overlay";
  if (rendererUrl) {
    return {
      type: "url" as const,
      value: new URL(normalizedRoute, rendererUrl.endsWith("/") ? rendererUrl : `${rendererUrl}/`).toString()
    };
  }

  const packagedRoot = join(import.meta.dirname, "renderer");
  return {
    type: "file" as const,
    value: normalizedRoute === "/" ? join(packagedRoot, "index.html") : join(packagedRoot, "overlay", "index.html")
  };
};

const loadRendererRoute = async (window: BrowserWindow, route: "/" | "/overlay", rendererUrl: string | null) => {
  const location = resolveRendererLocation(route, rendererUrl);
  if (location.type === "url") {
    await window.loadURL(location.value);
    return;
  }
  await window.loadFile(location.value);
};

const postJson = async <TResponse>(
  baseUrl: string,
  serviceToken: string,
  path: string,
  body: Record<string, unknown>
): Promise<TResponse> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceToken}`
    },
    body: JSON.stringify(body)
  });
  const data = (await response.json().catch(() => ({}))) as TResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? JSON.stringify(data));
  }
  return data;
};

const stopOverlaySession = async (logger: AppLogger) => {
  const activeSession = meetingCoordinator?.getActiveSession();
  if (!activeSession) {
    return { ok: false, reason: "no-active-session" };
  }

  try {
    const result = await captureService?.stopCapture(activeSession.interviewId);
    overlayController?.close();
    meetingCoordinator?.markSessionStopped();
    return result ?? { ok: true };
  } catch (error) {
    logger.error("Failed to stop overlay capture session", { error, interviewId: activeSession.interviewId });
    throw error;
  }
};

const createMainWindow = async (logger: AppLogger) => {
  const userData = app.getPath("userData");
  const dbPath = join(userData, "data", "scope.db");
  const rendererUrl = app.isPackaged
    ? process.env.RENDERER_URL?.trim() || null
    : process.env.RENDERER_URL?.trim() || "http://127.0.0.1:3000";
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

  const baseUrl = `http://127.0.0.1:${localService.port}`;
  captureService = new CaptureService(baseUrl);

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

  overlayController = new OverlayWindowController({
    preloadPath: join(import.meta.dirname, "preload.js"),
    loadOverlay: async (window, session) => {
      await loadRendererRoute(window, "/overlay", rendererUrl);
      logger.info("Overlay opened", { interviewId: session.interviewId });
    }
  });

  meetingCoordinator = new MeetingCoordinator({
    promptUser: async (candidate) => {
      if (!mainWindow) {
        return false;
      }
      const detail = [
        `Confidence: ${candidate.confidence}`,
        candidate.event ? `Calendar: ${candidate.event.title}` : "Calendar: no nearby event found",
        "Recording starts only if you confirm."
      ].join("\n");
      const response = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["Start recording", "Not now"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        message: `Likely ${candidate.process.processName} meeting detected`,
        detail
      });
      return response.response === 0;
    },
    startSession: async (candidate) => {
      const interview = await postJson<{ id: string }>(baseUrl, localService.serviceToken, "/v1/interviews/start", {
        consentAccepted: true
      });
      await captureService?.startCapture(interview.id, "default", true);
      const session = {
        interviewId: interview.id,
        title: candidate.title,
        confidence: candidate.confidence,
        startedAt: new Date().toISOString()
      } as const;
      await overlayController?.open(session);
      return session;
    },
    onSessionStopped: () => {
      overlayController?.close();
    }
  });

  registerIpcHandlers({
    captureService,
    keychainStore,
    servicePort: localService.port,
    serviceToken: localService.serviceToken,
    rendererUrl: rendererUrl ?? pathToFileURL(resolveRendererLocation("/", null).value).toString(),
    getOverlayState: () => overlayController?.getState() ?? null,
    stopOverlaySession: () => stopOverlaySession(logger)
  });

  let latestProcesses: MeetingProcessPresence[] = [];
  let latestEvents: CalendarEvent[] = [];

  const evaluateMeetingCandidate = () => {
    const candidate = findMeetingCandidate(latestProcesses, latestEvents, new Date());
    void meetingCoordinator?.considerCandidate(candidate).catch((error) => {
      logger.warn("Meeting candidate evaluation failed", { error, candidate });
    });
  };

  processWatcher = new MeetingProcessWatcher({
    onUpdate: (processes) => {
      latestProcesses = processes;
      evaluateMeetingCandidate();
    },
    onError: (error) => {
      logger.warn("Meeting process watcher failed", { error });
    }
  });

  calendarSync = new GoogleCalendarSync({
    keychainStore,
    onUpdate: (snapshot) => {
      latestEvents = snapshot.events;
      evaluateMeetingCandidate();
    },
    onError: (error) => {
      logger.warn("Google Calendar sync failed", { error });
    }
  });

  processWatcher.start();
  calendarSync.start();

  await loadRendererRoute(mainWindow, "/", rendererUrl);

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

  createMainWindow(logger).catch((error) => {
    logger.error("Failed to start desktop app", { error });
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow(logger);
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
  processWatcher?.stop();
  processWatcher = null;
  calendarSync?.stop();
  calendarSync = null;
  overlayController?.close();
  overlayController = null;

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
