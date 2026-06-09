import Redis from 'ioredis';
import { config } from './env';

let redisLastError: string | null = null;
let redisLastConnectedAt: string | null = null;
let redisReconnectCount = 0;
let redisBlockingLastError: string | null = null;
let redisBlockingReconnectCount = 0;
const redisFirstConnectStartedAtMs = Date.now();

// Create Redis client with retry strategy
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect if Redis is in READONLY mode
      return true;
    }
    return false;
  },
});

/**
 * Separate connection for BRPOP, XREADGROUP BLOCK, and other blocking commands.
 * Never run blocking reads on `redis` — they monopolize the shared socket and stall
 * cache GET/SET used by API handlers (e.g. /api/news waiting 5–25s behind XREAD BLOCK).
 * maxRetriesPerRequest: null matches ioredis guidance for blocking commands.
 */
export const redisBlocking = redis.duplicate({
  maxRetriesPerRequest: null,
});

let redisShutdownRequested = false;

export function isRedisShutdownRequested(): boolean {
  return redisShutdownRequested;
}

// Redis connection event handlers
redis.on('connect', () => {
  redisLastConnectedAt = new Date().toISOString();
  redisLastError = null;
  console.log('✅ Redis connected');
  console.log(`⏱️ Redis connection established after ${Date.now() - redisFirstConnectStartedAtMs}ms`);
});

redis.on('error', (err) => {
  redisLastError = err.message;
  console.error('❌ Redis error:', err.message);
});

redis.on('reconnecting', () => {
  redisReconnectCount += 1;
  console.log('🔄 Redis reconnecting...');
});

redisBlocking.on('error', (err) => {
  redisBlockingLastError = err.message;
  console.error('❌ Redis (blocking) error:', err.message);
});

redisBlocking.on('reconnecting', () => {
  redisBlockingReconnectCount += 1;
  console.log('🔄 Redis (blocking) reconnecting...');
});

async function gracefulRedisClose(): Promise<void> {
  if (redisShutdownRequested) return;
  redisShutdownRequested = true;
  await Promise.all([
    redis.quit().catch(() => {}),
    redisBlocking.quit().catch(() => {}),
  ]);
}

process.on('SIGTERM', gracefulRedisClose);
process.on('SIGINT', gracefulRedisClose);

// Cache helpers
export const cacheHelpers = {
  /**
   * Get cached value with JSON parsing
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Set cached value with JSON stringification and TTL
   */
  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  },

  /**
   * Delete cached value
   */
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      console.error(`Cache del error for key ${key}:`, error);
    }
  },

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  },
};

export default redis;

export function getRedisDiagnostics(): Record<string, unknown> {
  return {
    redisStatus: redis.status,
    redisBlockingStatus: redisBlocking.status,
    redisLastError,
    redisBlockingLastError,
    redisReconnectCount,
    redisBlockingReconnectCount,
    redisLastConnectedAt,
  };
}
