export const createRateLimiter = (params: { windowMs: number; maxRequests: number }) => {
  const windowMs = Number.isFinite(params.windowMs) && params.windowMs > 0 ? params.windowMs : 60_000;
  const maxRequests = Number.isFinite(params.maxRequests) && params.maxRequests > 0 ? params.maxRequests : 5;
  const buckets = new Map<string, number[]>();
  let lastPrune = Date.now();

  const pruneStale = (now: number) => {
    if (now - lastPrune < windowMs) return;
    lastPrune = now;
    const windowStart = now - windowMs;
    for (const [key, timestamps] of buckets) {
      const recent = timestamps.filter((at) => at >= windowStart);
      if (recent.length === 0) {
        buckets.delete(key);
      } else {
        buckets.set(key, recent);
      }
    }
  };

  return {
    allow(key: string) {
      const now = Date.now();
      pruneStale(now);
      const windowStart = now - windowMs;
      const recent = (buckets.get(key) ?? []).filter((at) => at >= windowStart);
      if (recent.length >= maxRequests) {
        buckets.set(key, recent);
        return false;
      }
      recent.push(now);
      buckets.set(key, recent);
      return true;
    }
  };
};
