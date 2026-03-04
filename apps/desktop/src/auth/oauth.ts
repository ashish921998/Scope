import { createServer } from "node:http";
import { URLSearchParams } from "node:url";
import { shell } from "electron";
import type { IntegrationProvider } from "@scope/types";

const buildAuthUrl = (provider: IntegrationProvider, redirectUri: string, state: string) => {
  if (provider === "slack") {
    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID ?? "",
      scope: process.env.SLACK_SCOPES ?? "channels:history,users:read",
      redirect_uri: redirectUri,
      state
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  if (provider === "linear") {
    const params = new URLSearchParams({
      client_id: process.env.LINEAR_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: process.env.LINEAR_SCOPES ?? "read,write",
      state
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
      state
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
      prompt: "consent"
    });
    return `https://auth.atlassian.com/authorize?${params.toString()}`;
  }

  throw new Error("PostHog uses API key. Use key save flow instead of OAuth connect.");
};

const randomState = () => Math.random().toString(36).slice(2, 12);

export const connectIntegrationOAuth = async (provider: IntegrationProvider, port = 4591) => {
  if (provider === "posthog") {
    return {
      provider,
      mode: "api-key",
      message: "PostHog requires API key. Save token through key settings flow."
    };
  }

  const state = randomState();
  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
  const authUrl = buildAuthUrl(provider, redirectUri, state);

  const code = waitForOAuthCode(port, state);
  await shell.openExternal(authUrl);

  const result = await code;
  return {
    provider,
    mode: "oauth",
    ...result
  };
};

const waitForOAuthCode = (port: number, state: string) => {
  return new Promise<{ code: string; receivedState: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "", `http://127.0.0.1:${port}`);
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
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timed out after 3 minutes."));
    }, 180_000);
  });
};
