import { redis } from '../../../config/redis';
import { SourceRegistry } from '../models/SourceRegistry';

const TRUST_CACHE_PREFIX = 'source:trust:';
const TRUST_CACHE_TTL_SEC = 3_600; // 1 h
const LRU_TTL_MS = 5 * 60 * 1_000; // 5 min

interface LruEntry {
  score: number;
  expiresAt: number;
}

const lru = new Map<string, LruEntry>();

function lruGet(key: string): number | undefined {
  const entry = lru.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    lru.delete(key);
    return undefined;
  }
  return entry.score;
}

function lruSet(key: string, score: number): void {
  if (lru.size > 500) {
    const oldest = lru.keys().next().value;
    if (oldest) lru.delete(oldest);
  }
  lru.set(key, { score, expiresAt: Date.now() + LRU_TTL_MS });
}

/**
 * Registry-backed async trust lookup.
 * Resolution: LRU (5m) → Redis (1h) → MongoDB → fallback 0.5
 */
export async function getSourceTrust(sourceKey?: string, sourceName?: string): Promise<number> {
  const key = (sourceKey || sourceName || '').toLowerCase().trim();
  if (!key) return 0.5;

  const cached = lruGet(key);
  if (cached !== undefined) return cached;

  try {
    const redisCached = await redis.get(`${TRUST_CACHE_PREFIX}${key}`);
    if (redisCached !== null) {
      const score = parseFloat(redisCached);
      lruSet(key, score);
      return score;
    }
  } catch {
    // Redis unavailable; continue
  }

  try {
    const entry = await SourceRegistry.findOne({ sourceKey: key }, { trustScore: 1 }).lean();
    const score = entry?.trustScore ?? 0.5;
    lruSet(key, score);
    try {
      await redis.setex(`${TRUST_CACHE_PREFIX}${key}`, TRUST_CACHE_TTL_SEC, String(score));
    } catch {
      // non-fatal
    }
    return score;
  } catch {
    return 0.5;
  }
}

/**
 * Sync wrapper: reads LRU only, falls back to 0.6.
 * Used in synchronous sentiment scoring paths during migration.
 */
export function getSourceTrustSync(sourceKey?: string, sourceName?: string): number {
  const key = (sourceKey || sourceName || '').toLowerCase().trim();
  if (!key) return 0.5;
  return lruGet(key) ?? 0.6;
}

/**
 * Invalidate trust cache for a source key (call after trust update).
 */
export async function invalidateTrustCache(sourceKey: string): Promise<void> {
  lru.delete(sourceKey);
  try {
    await redis.del(`${TRUST_CACHE_PREFIX}${sourceKey}`);
  } catch {
    // non-fatal
  }
}
