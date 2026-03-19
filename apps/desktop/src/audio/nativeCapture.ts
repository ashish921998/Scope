import { EventEmitter } from "node:events";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { AudioChunkSource } from "@scope/types";

const HELPER_NAME = "ScopeAudioCapture";

export interface NativeCaptureChunkEvent {
  type: "chunk";
  source: AudioChunkSource;
  audioBase64: string;
  frames: number;
  timestampMs: number;
}

export interface NativeCaptureReadyEvent {
  type: "ready";
  sampleRateHz: number;
  sources: AudioChunkSource[];
}

export interface NativeCaptureWarningEvent {
  type: "warning";
  code: string;
  message: string;
}

export interface NativeCaptureFatalEvent {
  type: "fatal";
  code: string;
  message: string;
}

export interface NativeCaptureStoppedEvent {
  type: "stopped";
}

export type NativeCaptureEvent =
  | NativeCaptureChunkEvent
  | NativeCaptureReadyEvent
  | NativeCaptureWarningEvent
  | NativeCaptureFatalEvent
  | NativeCaptureStoppedEvent;

export interface NativeCaptureStartOptions {
  sessionId: string;
  micDeviceId: string;
  includeSystemAudio: boolean;
  chunkDurationMs?: number;
}

const isAudioSource = (value: unknown): value is AudioChunkSource => value === "mic" || value === "system";

export const parseNativeCaptureEvent = (line: string): NativeCaptureEvent | null => {
  const raw = line.trim();
  if (!raw) {
    return null;
  }

  const payload = JSON.parse(raw) as Record<string, unknown>;
  const type = String(payload.type ?? "");

  if (type === "ready") {
    const sources = Array.isArray(payload.sources) ? payload.sources.filter(isAudioSource) : [];
    return {
      type,
      sampleRateHz: Number(payload.sampleRateHz ?? 24000),
      sources
    };
  }

  if (type === "chunk") {
    const source = payload.source;
    if (!isAudioSource(source)) {
      throw new Error("Native capture chunk must include a valid source.");
    }

    return {
      type,
      source,
      audioBase64: String(payload.audioBase64 ?? ""),
      frames: Number(payload.frames ?? 0),
      timestampMs: Number(payload.timestampMs ?? Date.now())
    };
  }

  if (type === "warning" || type === "fatal") {
    return {
      type,
      code: String(payload.code ?? "native_capture_error"),
      message: String(payload.message ?? "Native capture error.")
    };
  }

  if (type === "stopped") {
    return { type };
  }

  throw new Error(`Unknown native capture event: ${type || "<empty>"}`);
};

const resolveDevHelperPath = () =>
  join(import.meta.dirname, "..", "..", "src", "audio", "native", "build", HELPER_NAME);

const resolvePackagedHelperPath = () => join(process.resourcesPath, "native", HELPER_NAME);

export const resolveNativeCaptureHelperPath = async () => {
  const candidates = process.env.SCOPE_AUDIO_HELPER_PATH?.trim()
    ? [process.env.SCOPE_AUDIO_HELPER_PATH.trim()]
    : [process.resourcesPath ? resolvePackagedHelperPath() : "", resolveDevHelperPath()];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Ignore missing candidate and continue.
    }
  }

  throw new Error("Native audio helper not found. Build apps/desktop/src/audio/native/build.sh first.");
};

export class NativeCaptureSession extends EventEmitter {
  private readonly child: ChildProcessByStdio<null, Readable, Readable>;
  private readonly helperPath: string;
  private stdoutBuffer = "";
  private stopPromise: Promise<void> | null = null;
  private exitPromise: Promise<void>;
  private stopped = false;
  private fatalError: Error | null = null;

  private constructor(child: ChildProcessByStdio<null, Readable, Readable>, helperPath: string) {
    super();
    this.child = child;
    this.helperPath = helperPath;
    this.exitPromise = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        this.flushStdoutBuffer();
        this.stopped = true;
        if (this.fatalError) {
          reject(this.fatalError);
          return;
        }
        if (code && code !== 0) {
          reject(new Error(`Native audio helper exited with code ${code}${signal ? ` (${signal})` : ""}.`));
          return;
        }
        resolve();
      });
    });
  }

  static async start(options: NativeCaptureStartOptions) {
    const helperPath = await resolveNativeCaptureHelperPath();
    const child = spawn(
      helperPath,
      [
        "--sessionId",
        options.sessionId,
        "--micDeviceId",
        options.micDeviceId,
        "--includeSystemAudio",
        options.includeSystemAudio ? "true" : "false",
        "--chunkDurationMs",
        String(options.chunkDurationMs ?? 500)
      ],
      {
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    const session = new NativeCaptureSession(child, helperPath);
    session.bindProcess();
    await session.waitForReady();
    return session;
  }

  get resolvedHelperPath() {
    return this.helperPath;
  }

  async stop() {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.stopPromise = (async () => {
      if (this.stopped) {
        await this.exitPromise.catch(() => {});
        return;
      }

      this.child.kill("SIGTERM");
      const timeout = setTimeout(() => {
        if (!this.stopped) {
          this.child.kill("SIGKILL");
        }
      }, 3_000);

      try {
        await this.exitPromise;
      } finally {
        clearTimeout(timeout);
      }
    })();

    return this.stopPromise;
  }

  private bindProcess() {
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      this.flushStdoutBuffer();
    });

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      const message = chunk.trim();
      if (message) {
        this.emit("warning", {
          type: "warning",
          code: "helper_stderr",
          message
        } satisfies NativeCaptureWarningEvent);
      }
    });
  }

  private flushStdoutBuffer() {
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      this.handleLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleLine(line: string) {
    try {
      const event = parseNativeCaptureEvent(line);
      if (!event) {
        return;
      }
      if (event.type === "fatal") {
        this.fatalError = new Error(`${event.code}: ${event.message}`);
      }
      this.emit(event.type, event);
    } catch (error) {
      this.fatalError = error as Error;
    }
  }

  private waitForReady() {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for native audio helper readiness."));
      }, 10_000);

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onFatal = (event: NativeCaptureFatalEvent) => {
        cleanup();
        reject(new Error(`${event.code}: ${event.message}`));
      };

      const onExit = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off("ready", onReady);
        this.off("fatal", onFatal);
        this.exitPromise.catch(onExit);
      };

      this.once("ready", onReady);
      this.once("fatal", onFatal);
      this.exitPromise.catch(onExit);
    });
  }
}

export const startNativeCaptureSession = (options: NativeCaptureStartOptions) => NativeCaptureSession.start(options);
