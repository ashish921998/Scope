const allowedHosts = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "slack.com",
  "github.com",
  "api.linear.app",
  "api.github.com",
  "app.posthog.com",
  "api.notion.com",
  "atlassian.net",
  "auth.atlassian.com",
  "oauth2.googleapis.com"
]);

export const assertAllowedEgress = (url: string) => {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const isAllowed =
    allowedHosts.has(hostname) ||
    [...allowedHosts].some((host) => hostname.endsWith(`.${host}`));
  if (!isAllowed) {
    throw new Error(`Blocked network egress to ${hostname}`);
  }
};

export const safeFetch = async (url: string, init?: RequestInit) => {
  assertAllowedEgress(url);
  return fetch(url, init);
};
