import { redactSensitiveText } from "@scope/core";
import { readFileSync } from "node:fs";

export const extractReferenceId = (providerResponse: unknown): string | null => {
  if (!providerResponse || typeof providerResponse !== "object") {
    return null;
  }

  const knownKeys = ["ticketId", "ticket_id", "referenceId", "reference_id", "id", "caseId", "case_id"];
  for (const key of knownKeys) {
    const value = (providerResponse as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

export const readLogTail = (logPath: string | undefined, maxLines: number) => {
  if (!logPath) {
    return {
      path: null,
      lineCount: 0,
      lines: [] as string[]
    };
  }

  try {
    const text = readFileSync(logPath, "utf-8");
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(-maxLines);

    return {
      path: logPath,
      lineCount: lines.length,
      lines
    };
  } catch {
    return {
      path: logPath,
      lineCount: 0,
      lines: [] as string[]
    };
  }
};

export const buildDiagnosticsBundle = (params: {
  appVersion: string;
  dbPath: string;
  health: Record<string, unknown>;
  logPath?: string;
  maxLogLines: number;
  notes?: string;
  email?: string;
  includeLogs: boolean;
  includeHealth: boolean;
  includeEmail: boolean;
  redactLogs: boolean;
  redactUserContext: boolean;
}) => {
  const rawLogs = params.includeLogs
    ? readLogTail(params.logPath, params.maxLogLines)
    : {
        path: params.logPath ?? null,
        lineCount: 0,
        lines: [] as string[]
      };
  const logs = {
    ...rawLogs,
    lines: params.redactLogs ? rawLogs.lines.map(redactSensitiveText) : rawLogs.lines
  };
  const notes = params.notes?.trim() || null;
  const email = params.includeEmail ? params.email?.trim() || null : null;
  return {
    product: "scope-desktop",
    appVersion: params.appVersion,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown"
    },
    health: params.includeHealth ? redactJsonStrings(params.health) : null,
    storage: {
      dbPath: params.dbPath
    },
    userContext: {
      notes: params.redactUserContext && notes ? redactSensitiveText(notes) : notes,
      email: params.redactUserContext && email ? redactSensitiveText(email) : email
    },
    logs
  };
};

export const redactJsonStrings = (value: unknown): unknown => {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactJsonStrings);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, redactJsonStrings(nestedValue)])
    );
  }
  return value;
};
