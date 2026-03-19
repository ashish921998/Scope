import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { URLSearchParams } from "node:url";
import { shell } from "electron";
import type { IntegrationProvider } from "@scope/types";
import { safeFetch } from "@scope/core";
import type { IntegrationTokenSecret } from "../security/keychain";

const OAUTH_TIMEOUT_MS = 180_000;

interface OAuthCallbackResult {
  code: string;
  receivedState: string;
}

interface OAuthConnectResult {
  provider: IntegrationProvider;
  mode: "oauth";
  token: IntegrationTokenSecret;
}

interface ApiKeyConnectResult {
  provider: IntegrationProvider;
  mode: "api-key";
  message: string;
}

const buildAuthUrl = (provider: IntegrationProvider, redirectUri: string, state: string, codeChallenge: string) => {
  if (provider === "slack") {
    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID ?? "",
      scope: process.env.SLACK_SCOPES ?? "channels:history,users:read",
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  if (provider === "linear") {
    const params = new URLSearchParams({
      client_id: process.env.LINEAR_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: process.env.LINEAR_SCOPES ?? "read,write",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    return `https://linear.app/oauth/authorize?${params.toString()}`;
  }

  if (provider === "github") {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      scope: process.env.GITHUB_SCOPES ?? "repo,read:user",
      state
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  if (provider === "notion") {
    const params = new URLSearchParams({
      client_id: process.env.NOTION_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      owner: "user",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  if (provider === "jira") {
    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: process.env.JIRA_CLIENT_ID ?? "",
      scope: process.env.JIRA_SCOPES ?? "read:jira-work write:jira-work",
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      prompt: "consent",
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    return `https://auth.atlassian.com/authorize?${params.toString()}`;
  }

  if (provider === "google_calendar") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: process.env.GOOGLE_SCOPES ?? "https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  throw new Error("PostHog uses API key. Use key save flow instead of OAuth connect.");
};

const randomState = () => randomBytes(15).toString("base64url");

const generatePKCE = () => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
};
const requireEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required OAuth environment variable: ${name}`);
  }
  return value;
};

const parseJsonOrThrow = async (response: Response, context: string) => {
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) {
    throw new Error(`${context} returned a non-JSON response.`);
  }
  return data;
};

const toExpiresAt = (expiresInSeconds?: number) =>
  typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds)
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : undefined;

const resolveLoopbackPort = async (preferredPort: number) => {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();

    const closeAndResolve = (port: number) => {
      probe.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    };

    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EADDRINUSE") {
        reject(error);
        return;
      }

      probe.listen(0, "127.0.0.1");
    });

    probe.once("listening", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Unable to determine OAuth callback port."));
        return;
      }

      closeAndResolve(address.port);
    });

    probe.listen(preferredPort, "127.0.0.1");
  });
};

export const connectIntegrationOAuth = async (
  provider: IntegrationProvider,
  preferredPort = 4591
): Promise<OAuthConnectResult | ApiKeyConnectResult> => {
  if (provider === "posthog") {
    return {
      provider,
      mode: "api-key",
      message: "PostHog requires API key. Save token through key settings flow."
    };
  }

  const state = randomState();
  const { verifier, challenge } = generatePKCE();
  const port = await resolveLoopbackPort(preferredPort);
  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
  const authUrl = buildAuthUrl(provider, redirectUri, state, challenge);

  const callback = waitForOAuthCode(port, state);
  await shell.openExternal(authUrl);

  const result = await callback;
  const token = await exchangeOAuthCode(provider, result.code, redirectUri, verifier);

  return {
    provider,
    mode: "oauth",
    token
  } satisfies OAuthConnectResult;
};

export const refreshIntegrationToken = async (
  provider: IntegrationProvider,
  refreshToken: string
): Promise<IntegrationTokenSecret> => {
  if (provider === "posthog" || provider === "github") {
    throw new Error(`${provider} does not support refresh token flow in this implementation.`);
  }

  if (provider === "slack") {
    const body = new URLSearchParams({
      client_id: requireEnv("SLACK_CLIENT_ID"),
      client_secret: requireEnv("SLACK_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
    const response = await safeFetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const data = await parseJsonOrThrow(response, "Slack token refresh");
    if (!response.ok || data.ok !== true || typeof data.access_token !== "string") {
      throw new Error(`Slack token refresh failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
      scope: (data.scope as string | undefined) ?? undefined,
      expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
      metadata: {
        tokenType: data.token_type ?? undefined
      }
    };
  }

  if (provider === "linear") {
    const body = new URLSearchParams({
      client_id: requireEnv("LINEAR_CLIENT_ID"),
      client_secret: requireEnv("LINEAR_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
    const response = await safeFetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const data = await parseJsonOrThrow(response, "Linear token refresh");
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(`Linear token refresh failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
      scope: (data.scope as string | undefined) ?? undefined,
      expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
      metadata: {
        tokenType: data.token_type ?? undefined
      }
    };
  }

  if (provider === "notion") {
    const clientId = requireEnv("NOTION_CLIENT_ID");
    const clientSecret = requireEnv("NOTION_CLIENT_SECRET");
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await safeFetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    });
    const data = await parseJsonOrThrow(response, "Notion token refresh");
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(`Notion token refresh failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
      scope: Array.isArray(data.duplicated_template_ids)
        ? "template_access"
        : (data.workspace_name as string | undefined),
      expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined)
    };
  }

  if (provider === "google_calendar") {
    const body = new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
    const response = await safeFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const data = await parseJsonOrThrow(response, "Google token refresh");
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
      scope: (data.scope as string | undefined) ?? undefined,
      expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
      metadata: {
        tokenType: data.token_type ?? undefined
      }
    };
  }

  const response = await safeFetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: requireEnv("JIRA_CLIENT_ID"),
      client_secret: requireEnv("JIRA_CLIENT_SECRET"),
      refresh_token: refreshToken
    })
  });
  const data = await parseJsonOrThrow(response, "Jira token refresh");
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`Jira token refresh failed: ${JSON.stringify(data)}`);
  }
  return {
    provider,
    accessToken: data.access_token,
    refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
    scope: (data.scope as string | undefined) ?? undefined,
    expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
    metadata: {
      tokenType: data.token_type ?? undefined
    }
  };
};

const waitForOAuthCode = (port: number, state: string) => {
  return new Promise<OAuthCallbackResult>((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "", `http://127.0.0.1:${port}`);

        if (url.pathname !== "/oauth/callback") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state") ?? "";

        if (!code) {
          res.statusCode = 400;
          res.end("Missing code");
          return;
        }

        if (receivedState !== state) {
          res.statusCode = 400;
          res.end("Invalid state");
          return;
        }

        res.statusCode = 200;
        res.end("Authentication complete. You can close this tab.");
        server.close();
        resolve({ code, receivedState });
      } catch (error) {
        server.close();
        reject(error);
      }
    });

    server.listen(port, "127.0.0.1");
    server.once("error", (err: Error) => {
      clearTimeout(timeoutHandle);
      reject(err);
    });
    const timeoutHandle = setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timed out after 3 minutes."));
    }, OAUTH_TIMEOUT_MS);
  });
};

const exchangeOAuthCode = async (
  provider: IntegrationProvider,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<IntegrationTokenSecret> => {
  if (provider === "slack") {
    const body = new URLSearchParams({
      client_id: requireEnv("SLACK_CLIENT_ID"),
      client_secret: requireEnv("SLACK_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    });
    const response = await safeFetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const data = await parseJsonOrThrow(response, "Slack token exchange");
    if (!response.ok || data.ok !== true || typeof data.access_token !== "string") {
      throw new Error(`Slack token exchange failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      refreshToken: data.refresh_token as string | undefined,
      scope: data.scope as string | undefined,
      expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
      metadata: {
        team: data.team ?? undefined,
        authedUser: data.authed_user ?? undefined,
        tokenType: data.token_type ?? undefined
      }
    };
  }

  if (provider === "linear") {
    const body = new URLSearchParams({
      client_id: requireEnv("LINEAR_CLIENT_ID"),
      client_secret: requireEnv("LINEAR_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    });
    const response = await safeFetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const data = await parseJsonOrThrow(response, "Linear token exchange");
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(`Linear token exchange failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      refreshToken: data.refresh_token as string | undefined,
      scope: data.scope as string | undefined,
      expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
      metadata: {
        tokenType: data.token_type ?? undefined
      }
    };
  }

  if (provider === "github") {
    const body = new URLSearchParams({
      client_id: requireEnv("GITHUB_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri
    });
    const response = await safeFetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    const data = await parseJsonOrThrow(response, "GitHub token exchange");
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(`GitHub token exchange failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      scope: data.scope as string | undefined,
      metadata: {
        tokenType: data.token_type ?? undefined
      }
    };
  }

  if (provider === "notion") {
    const clientId = requireEnv("NOTION_CLIENT_ID");
    const clientSecret = requireEnv("NOTION_CLIENT_SECRET");
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await safeFetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });
    const data = await parseJsonOrThrow(response, "Notion token exchange");
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(`Notion token exchange failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      refreshToken: data.refresh_token as string | undefined,
      scope: data.workspace_name as string | undefined,
      expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
      metadata: {
        workspaceId: data.workspace_id ?? undefined
      }
    };
  }

  if (provider === "google_calendar") {
    const body = new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    });
    const response = await safeFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const data = await parseJsonOrThrow(response, "Google token exchange");
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(`Google token exchange failed: ${JSON.stringify(data)}`);
    }
    return {
      provider,
      accessToken: data.access_token,
      refreshToken: data.refresh_token as string | undefined,
      scope: data.scope as string | undefined,
      expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
      metadata: {
        tokenType: data.token_type ?? undefined
      }
    };
  }

  const response = await safeFetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: requireEnv("JIRA_CLIENT_ID"),
      client_secret: requireEnv("JIRA_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });
  const data = await parseJsonOrThrow(response, "Jira token exchange");
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`Jira token exchange failed: ${JSON.stringify(data)}`);
  }
  return {
    provider,
    accessToken: data.access_token,
    refreshToken: data.refresh_token as string | undefined,
    scope: data.scope as string | undefined,
    expiresAt: toExpiresAt(typeof data.expires_in === "number" ? data.expires_in : undefined),
    metadata: {
      tokenType: data.token_type ?? undefined
    }
  };
};
