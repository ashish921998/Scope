import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { captureSentryError, captureSentryWarning } from "./sentry";

export interface AppLogger {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
}

const toErrorObject = (value: unknown) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  return value;
};

const safeSerialize = (metadata?: Record<string, unknown>) => {
  if (!metadata) {
    return undefined;
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    normalized[key] = toErrorObject(value);
  }
  return normalized;
};

const writeLine = (path: string, level: "info" | "warn" | "error", message: string, metadata?: Record<string, unknown>) => {
  const record = {
    at: new Date().toISOString(),
    level,
    message,
    metadata: safeSerialize(metadata)
  };

  appendFileSync(path, `${JSON.stringify(record)}\n`, { encoding: "utf-8" });
};

export const createAppLogger = (logFilePath: string): AppLogger => {
  mkdirSync(dirname(logFilePath), { recursive: true });

  return {
    info: (message, metadata) => {
      writeLine(logFilePath, "info", message, metadata);
      console.info(message, metadata ?? "");
    },
    warn: (message, metadata) => {
      writeLine(logFilePath, "warn", message, metadata);
      captureSentryWarning(message, metadata);
      console.warn(message, metadata ?? "");
    },
    error: (message, metadata) => {
      writeLine(logFilePath, "error", message, metadata);
      captureSentryError(message, metadata);
      console.error(message, metadata ?? "");
    }
  };
};

export const resolveDefaultLogPath = (userDataDir: string) =>
  join(userDataDir, "logs", `scope-${new Date().toISOString().slice(0, 10)}.log`);
