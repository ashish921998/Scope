import * as Sentry from "@sentry/node";

let sentryEnabled = false;

const applyMetadataToScope = (scope: Sentry.Scope, metadata?: Record<string, unknown>) => {
  if (!metadata) {
    return;
  }
  for (const [key, value] of Object.entries(metadata)) {
    scope.setExtra(key, value);
  }
};

export const initSentryTelemetry = (params: {
  dsn?: string;
  environment?: string;
  release?: string;
}) => {
  const dsn = params.dsn?.trim();
  if (!dsn) {
    sentryEnabled = false;
    return { enabled: false as const };
  }

  Sentry.init({
    dsn,
    environment: params.environment ?? process.env.NODE_ENV ?? "development",
    release: params.release,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0")
  });

  sentryEnabled = true;
  return { enabled: true as const };
};

export const captureSentryWarning = (message: string, metadata?: Record<string, unknown>) => {
  if (!sentryEnabled) {
    return;
  }

  Sentry.withScope((scope) => {
    applyMetadataToScope(scope, metadata);
    scope.setLevel("warning");
    Sentry.captureMessage(message);
  });
};

export const captureSentryError = (message: string, metadata?: Record<string, unknown>) => {
  if (!sentryEnabled) {
    return;
  }

  const error = metadata?.error;
  if (error instanceof Error) {
    Sentry.withScope((scope) => {
      applyMetadataToScope(scope, metadata);
      Sentry.captureException(error);
    });
    return;
  }

  Sentry.withScope((scope) => {
    applyMetadataToScope(scope, metadata);
    scope.setLevel("error");
    Sentry.captureMessage(message);
  });
};

export const flushSentryTelemetry = async (timeoutMs = 2000) => {
  if (!sentryEnabled) {
    return;
  }
  await Sentry.flush(timeoutMs);
};
