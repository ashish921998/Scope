const allowedHosts = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "slack.com",
  "api.linear.app",
  "api.github.com",
  "app.posthog.com",
  "api.notion.com",
  "atlassian.net"
]);

export const assertAllowedEgress = (url: string) => {
  const parsed = new URL(url);
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(`Blocked network egress to ${parsed.hostname}`);
  }
};

export const safeFetch = async (url: string, init?: RequestInit) => {
  assertAllowedEgress(url);
  return fetch(url, init);
};
