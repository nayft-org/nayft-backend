/**
 * In-memory observability for Phase 0: request timings, payload sizes, cache labels.
 * Safe for multi-request; not durable across restarts (by design).
 */

export type HttpRequestSample = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  responseBytes: number;
  at: number;
};

export type CacheCounter = { hits: number; misses: number };

const MAX_SAMPLES = 300;
const samples: HttpRequestSample[] = [];

const cacheCounters: Record<string, CacheCounter> = {};

export function recordHttpRequest(sample: Omit<HttpRequestSample, 'at'>): void {
  samples.push({ ...sample, at: Date.now() });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

export function recordCacheEvent(kind: string, hit: boolean): void {
  if (!cacheCounters[kind]) {
    cacheCounters[kind] = { hits: 0, misses: 0 };
  }
  if (hit) cacheCounters[kind].hits += 1;
  else cacheCounters[kind].misses += 1;
}

export function getHttpPerformanceSnapshot(): {
  recentRequests: HttpRequestSample[];
  cache: Record<string, CacheCounter & { hitRate: string }>;
  summary: { count: number; avgMs: number; p95Ms: number };
} {
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const count = durations.length;
  const avgMs = count ? durations.reduce((a, b) => a + b, 0) / count : 0;
  const p95Ms = count ? durations[Math.floor(count * 0.95)] ?? durations[count - 1] : 0;

  const cache: Record<string, CacheCounter & { hitRate: string }> = {};
  for (const [k, v] of Object.entries(cacheCounters)) {
    const t = v.hits + v.misses;
    cache[k] = {
      ...v,
      hitRate: t > 0 ? `${((v.hits / t) * 100).toFixed(1)}%` : '0%',
    };
  }

  return {
    recentRequests: [...samples],
    cache,
    summary: { count, avgMs: Math.round(avgMs * 100) / 100, p95Ms },
  };
}
