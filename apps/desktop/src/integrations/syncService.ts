import { safeFetch, type SignalService } from "@scope/core";
import type { IntegrationProvider, SignalIngestInput } from "@scope/types";
import type { KeychainStore } from "../security/keychain";
import { refreshIntegrationToken } from "../auth/oauth";
import type { AppLogger } from "../telemetry/logger";

type SyncProvider = "slack" | "linear" | "posthog";

interface SyncRequestInput {
  provider?: SyncProvider;
  providers?: SyncProvider[];
  slack?: {
    channelId?: string;
    limit?: number;
  };
  linear?: {
    teamId?: string;
    limit?: number;
  };
  posthog?: {
    projectId?: string;
    limit?: number;
  };
}

interface ProviderSyncResult {
  provider: SyncProvider;
  pulled: number;
  ingested: number;
  deduped: number;
}

interface SyncResponse {
  ok: true;
  results: ProviderSyncResult[];
  totals: {
    pulled: number;
    ingested: number;
    deduped: number;
  };
}

interface SyncSnapshot {
  inFlight: boolean;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastError?: string;
  lastResult?: {
    totals: {
      pulled: number;
      ingested: number;
      deduped: number;
    };
  };
}

const asArray = <T>(value: T | T[] | undefined) => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const expiresSoon = (expiresAt?: string, skewMs = 90_000) => {
  if (!expiresAt) {
    return false;
  }
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) {
    return false;
  }
  return expiry - Date.now() <= skewMs;
};

const extractSlackMessages = (data: Record<string, unknown>) => {
  const messages = data.messages;
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
};

const parseLinearIssues = (data: Record<string, unknown>) => {
  const payload = data.data;
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const issues = (payload as { issues?: { nodes?: unknown } }).issues;
  if (!issues || typeof issues !== "object") {
    return [];
  }
  const nodes = issues.nodes;
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
};

const parsePosthogEvents = (data: Record<string, unknown>) => {
  const events = data.results;
  if (!Array.isArray(events)) {
    return [];
  }
  return events.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
};

export class IntegrationSyncService {
  private inFlight: Promise<SyncResponse> | null = null;
  private readonly snapshot: SyncSnapshot = {
    inFlight: false
  };

  constructor(
    private readonly deps: {
      signalService: SignalService;
      keychainStore: KeychainStore;
      logger?: AppLogger;
    }
  ) {}

  async sync(input: SyncRequestInput) {
    if (this.inFlight) {
      this.deps.logger?.info("Integration sync reused existing in-flight run");
      return this.inFlight;
    }

    this.snapshot.inFlight = true;
    this.snapshot.lastStartedAt = new Date().toISOString();
    this.snapshot.lastError = undefined;

    const run = this.syncInternal(input)
      .then((result) => {
        this.snapshot.lastResult = {
          totals: result.totals
        };
        return result;
      })
      .catch((error) => {
        this.snapshot.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      })
      .finally(() => {
        this.snapshot.inFlight = false;
        this.snapshot.lastFinishedAt = new Date().toISOString();
        this.inFlight = null;
      });

    this.inFlight = run;
    return run;
  }

  getHealthSnapshot(): SyncSnapshot {
    return {
      ...this.snapshot
    };
  }

  private async syncInternal(input: SyncRequestInput): Promise<SyncResponse> {
    const providers = Array.from(
      new Set(asArray(input.provider).concat(asArray(input.providers)).filter(Boolean))
    ) as SyncProvider[];

    const selected = providers.length > 0 ? providers : (["slack", "linear", "posthog"] as SyncProvider[]);

    const results: ProviderSyncResult[] = [];
    for (const provider of selected) {
      if (provider === "slack") {
        results.push(await this.syncSlack(input.slack));
        continue;
      }
      if (provider === "linear") {
        results.push(await this.syncLinear(input.linear));
        continue;
      }
      results.push(await this.syncPosthog(input.posthog));
    }

    return {
      ok: true,
      results,
      totals: {
        pulled: results.reduce((sum, item) => sum + item.pulled, 0),
        ingested: results.reduce((sum, item) => sum + item.ingested, 0),
        deduped: results.reduce((sum, item) => sum + item.deduped, 0)
      }
    } satisfies SyncResponse;
  }

  private async resolveAccessToken(provider: IntegrationProvider) {
    const token = await this.deps.keychainStore.getIntegrationToken(provider);
    if (!token?.accessToken) {
      throw new Error(`No integration token found for provider: ${provider}`);
    }

    if (provider === "posthog") {
      return token.accessToken;
    }

    if (token.refreshToken && expiresSoon(token.expiresAt)) {
      const refreshed = await refreshIntegrationToken(provider, token.refreshToken);
      await this.deps.keychainStore.saveIntegrationToken(refreshed);
      return refreshed.accessToken;
    }

    return token.accessToken;
  }

  private ingestSignals(items: SignalIngestInput[]) {
    let ingested = 0;
    let deduped = 0;
    for (const item of items) {
      const result = this.deps.signalService.ingest(item);
      if (result.deduped) {
        deduped += 1;
      } else {
        ingested += 1;
      }
    }
    return { ingested, deduped };
  }

  private async syncSlack(config?: { channelId?: string; limit?: number }): Promise<ProviderSyncResult> {
    const accessToken = await this.resolveAccessToken("slack");
    const limit = Math.min(Math.max(config?.limit ?? 50, 1), 200);
    const channelId = config?.channelId?.trim();

    if (!channelId) {
      throw new Error("Slack sync requires `slack.channelId`.");
    }

    const params = new URLSearchParams({
      channel: channelId,
      limit: String(limit)
    });

    const response = await this.fetchWithRetry(`https://slack.com/api/conversations.history?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || data.ok !== true) {
      throw new Error(`Slack sync failed: ${JSON.stringify(data)}`);
    }

    const messages = extractSlackMessages(data);
    const items: SignalIngestInput[] = [];
    for (const message of messages) {
      const text = String(message.text ?? "").trim();
      const ts = String(message.ts ?? "").trim();
      if (!text || !ts) {
        continue;
      }
      items.push({
        source: "slack",
        sourceRef: `channel:${channelId}:ts:${ts}`,
        text,
        evidenceKind: "message",
        evidenceUri: `slack://channel/${channelId}/message/${ts}`
      });
    }

    const { ingested, deduped } = this.ingestSignals(items);
    return {
      provider: "slack",
      pulled: items.length,
      ingested,
      deduped
    };
  }

  private async syncLinear(config?: { teamId?: string; limit?: number }): Promise<ProviderSyncResult> {
    const accessToken = await this.resolveAccessToken("linear");
    const limit = Math.min(Math.max(config?.limit ?? 50, 1), 250);
    const teamId = config?.teamId?.trim();

    const query = `
      query ScopeIssueSync($first: Int!, $teamId: ID) {
        issues(first: $first, filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            identifier
            title
            description
            createdAt
          }
        }
      }`;

    const body = JSON.stringify({
      query,
      variables: {
        first: limit,
        teamId: teamId || null
      }
    });

    const response = await this.fetchWithRetry("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: accessToken
      },
      body
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || data.errors) {
      throw new Error(`Linear sync failed: ${JSON.stringify(data)}`);
    }

    const issues = parseLinearIssues(data);
    const items: SignalIngestInput[] = [];
    for (const issue of issues) {
      const id = String(issue.id ?? "").trim();
      const identifier = String(issue.identifier ?? "").trim();
      const title = String(issue.title ?? "").trim();
      const description = String(issue.description ?? "").trim();
      if (!id || !title) {
        continue;
      }
      const text = description ? `${title}. ${description}` : title;
      items.push({
        source: "linear",
        sourceRef: id,
        text,
        evidenceKind: "issue",
        evidenceUri: `linear://issue/${identifier || id}`
      });
    }

    const { ingested, deduped } = this.ingestSignals(items);
    return {
      provider: "linear",
      pulled: items.length,
      ingested,
      deduped
    };
  }

  private async syncPosthog(config?: { projectId?: string; limit?: number }): Promise<ProviderSyncResult> {
    const accessToken = await this.resolveAccessToken("posthog");
    const projectId = config?.projectId?.trim();
    if (!projectId) {
      throw new Error("PostHog sync requires `posthog.projectId`.");
    }

    const limit = Math.min(Math.max(config?.limit ?? 50, 1), 200);
    const params = new URLSearchParams({
      limit: String(limit)
    });

    const response = await this.fetchWithRetry(
      `https://app.posthog.com/api/projects/${encodeURIComponent(projectId)}/events/?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`PostHog sync failed: ${JSON.stringify(data)}`);
    }

    const events = parsePosthogEvents(data);
    const items: SignalIngestInput[] = [];
    for (const event of events) {
      const uuid = String(event.uuid ?? event.id ?? "").trim();
      const eventName = String(event.event ?? "").trim();
      if (!uuid || !eventName) {
        continue;
      }
      const properties = event.properties;
      const summaryBits = [eventName];
      if (properties && typeof properties === "object") {
        const url = (properties as Record<string, unknown>).$current_url;
        const pathname = (properties as Record<string, unknown>).$pathname;
        if (typeof pathname === "string" && pathname.trim()) {
          summaryBits.push(`path ${pathname.trim()}`);
        } else if (typeof url === "string" && url.trim()) {
          summaryBits.push(`url ${url.trim()}`);
        }
      }
      items.push({
        source: "posthog",
        sourceRef: uuid,
        text: summaryBits.join(" - "),
        evidenceKind: "event",
        evidenceUri: `posthog://project/${projectId}/event/${uuid}`
      });
    }

    const { ingested, deduped } = this.ingestSignals(items);
    return {
      provider: "posthog",
      pulled: items.length,
      ingested,
      deduped
    };
  }

  private async fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await safeFetch(url, init);
        if (response.status === 429 || response.status >= 500) {
          if (attempt < retries) {
            const waitMs = 250 * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          const waitMs = 250 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Network request failed.");
  }
}
