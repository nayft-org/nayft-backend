import { performance } from 'node:perf_hooks';
import { cacheHelpers } from '../../config/redis';
import { recordCacheEvent } from '../../utils/httpPerformanceStats';
import { withResponseCache, type ResponseCacheOptions } from '../../utils/responseCache';

export type NewsFetchTiming = {
  cacheLookupMs: number;
  fetcherMs: number;
  cacheHit: boolean;
};

/**
 * Redis lookup with timing, then optional fetcher via withResponseCache (stampede-safe).
 */
export async function fetchNewsWithTiming<T>(
  options: ResponseCacheOptions<T>
): Promise<{ data: T; cacheHit: boolean; cacheLookupMs: number; fetcherMs: number }> {
  const cacheLookupStart = performance.now();
  let cacheHit = false;

  try {
    const cached = await cacheHelpers.get<T>(options.cacheKey);
    const cacheLookupMs = performance.now() - cacheLookupStart;
    if (cached !== null && cached !== undefined) {
      if (options.metricsKind) recordCacheEvent(options.metricsKind, true);
      return { data: cached, cacheHit: true, cacheLookupMs, fetcherMs: 0 };
    }
  } catch {
    // fall through to compute
  }

  const cacheLookupMs = performance.now() - cacheLookupStart;
  const fetcherStart = performance.now();
  const { data, cacheHit: computedHit } = await withResponseCache(options);
  const fetcherMs = performance.now() - fetcherStart;
  cacheHit = computedHit;
  return { data, cacheHit, cacheLookupMs, fetcherMs };
}
