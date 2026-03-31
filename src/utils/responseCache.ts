import { cacheHelpers } from '../config/redis';
import { recordCacheEvent } from './httpPerformanceStats';

/** Single-flight map: one DB compute per key while in flight */
const inflight = new Map<string, Promise<unknown>>();

export type ResponseCacheOptions<T> = {
  cacheKey: string;
  ttlSeconds: number;
  fetcher: () => Promise<T>;
  /** e.g. chart:mt — for hit/miss metrics */
  metricsKind?: string;
};

/**
 * Redis-backed cache with stampede protection (in-process coalescing).
 * On Redis failure: bypass cache, run fetcher only (never throws from cache layer).
 */
export async function withResponseCache<T>(options: ResponseCacheOptions<T>): Promise<{ data: T; cacheHit: boolean }> {
  const { cacheKey, ttlSeconds, fetcher, metricsKind } = options;

  try {
    const cached = await cacheHelpers.get<T>(cacheKey);
    if (cached !== null && cached !== undefined) {
      if (metricsKind) recordCacheEvent(metricsKind, true);
      return { data: cached, cacheHit: true };
    }
  } catch {
    // Redis read failed — fall through to compute
  }

  if (metricsKind) recordCacheEvent(metricsKind, false);

  let pending = inflight.get(cacheKey) as Promise<T> | undefined;
  if (!pending) {
    pending = (async () => {
      try {
        const data = await fetcher();
        try {
          await cacheHelpers.set(cacheKey, data as object, ttlSeconds);
        } catch {
          // ignore set failures
        }
        return data;
      } finally {
        inflight.delete(cacheKey);
      }
    })();
    inflight.set(cacheKey, pending);
  }

  const data = await pending;
  return { data, cacheHit: false };
}

export function buildChartMarketTrendKey(params: {
  exchange: string;
  interval: string;
  limit: number;
  maxCoins: number;
  fromIso: string;
  toIso: string;
}): string {
  return `chart:mt:v1:${params.exchange}:${params.interval}:${params.limit}:${params.maxCoins}:${params.fromIso}:${params.toIso}`;
}

export function buildChartKlinesKey(params: {
  exchange: string;
  symbol: string;
  interval: string;
  limit: number;
  fromIso: string;
  toIso: string;
}): string {
  return `chart:kl:v1:${params.exchange}:${params.symbol}:${params.interval}:${params.limit}:${params.fromIso}:${params.toIso}`;
}

/** Batched implementation (market-trend-v2); separate key until parity is proven in prod. */
export function buildChartMarketTrendV2Key(params: {
  exchange: string;
  interval: string;
  limit: number;
  maxCoins: number;
  fromIso: string;
  toIso: string;
}): string {
  return `chart:mtv2:v1:${params.exchange}:${params.interval}:${params.limit}:${params.maxCoins}:${params.fromIso}:${params.toIso}`;
}

export function buildNewsListKey(params: {
  userScope: string;
  page: number;
  limit: number;
  categoriesSig: string;
}): string {
  return `news:list:v1:${params.userScope}:${params.page}:${params.limit}:${params.categoriesSig}`;
}

export function buildNewsFollowingKey(params: {
  userId: string;
  page: number;
  limit: number;
  mode: string;
  categoriesSig: string;
}): string {
  return `news:following:v1:${params.userId}:${params.page}:${params.limit}:${params.mode}:${params.categoriesSig}`;
}
