import { redis } from '../../config/redis';
import {
  DEFAULT_RUNTIME_SWITCHES,
  RUNTIME_CONFIG_MONGO_KEY,
  RUNTIME_CONFIG_REDIS_KEY,
  type RuntimeConfigDocument,
  type RuntimeKillSwitches,
} from './runtimeConfig.types';

let memoryCache: RuntimeConfigDocument | null = null;
let memoryCacheAt = 0;
const MEMORY_TTL_MS = 10_000;

let switchSnapshot: RuntimeKillSwitches = { ...DEFAULT_RUNTIME_SWITCHES };
let snapshotVersion = 0;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

function syncSwitchSnapshot(cfg: RuntimeConfigDocument): void {
  switchSnapshot = { ...cfg.switches };
  snapshotVersion += 1;
}

function defaultMinAppVersion(): string {
  if (process.env.MIN_APP_VERSION?.trim()) {
    return process.env.MIN_APP_VERSION.trim();
  }
  return process.env.NODE_ENV === 'production' ? '1.0.0' : '0.0.0';
}

function buildDefaultConfig(): RuntimeConfigDocument {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    switches: { ...DEFAULT_RUNTIME_SWITCHES },
    minAppVersion: defaultMinAppVersion(),
  };
}

async function loadFromMongo(): Promise<RuntimeConfigDocument | null> {
  try {
    const mongoose = await import('mongoose');
    if (mongoose.connection.readyState !== 1) return null;
    const col = mongoose.connection.db?.collection('admin_config');
    if (!col) return null;
    const doc = await col.findOne({ key: RUNTIME_CONFIG_MONGO_KEY });
    if (!doc || typeof doc !== 'object') return null;
    const payload = doc.payload as RuntimeConfigDocument | undefined;
    if (!payload?.switches) return null;
    return {
      version: payload.version ?? 1,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
      updatedBy: payload.updatedBy,
      switches: { ...DEFAULT_RUNTIME_SWITCHES, ...payload.switches },
      minAppVersion: payload.minAppVersion ?? '1.0.0',
    };
  } catch {
    return null;
  }
}

async function loadFromRedis(): Promise<RuntimeConfigDocument | null> {
  try {
    const raw = await redis.get(RUNTIME_CONFIG_REDIS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuntimeConfigDocument;
    if (!parsed?.switches) return null;
    return {
      ...parsed,
      switches: { ...DEFAULT_RUNTIME_SWITCHES, ...parsed.switches },
    };
  } catch {
    return null;
  }
}

export async function getRuntimeConfig(): Promise<RuntimeConfigDocument> {
  const now = Date.now();
  if (memoryCache && now - memoryCacheAt < MEMORY_TTL_MS) {
    return memoryCache;
  }

  const fromRedis = await loadFromRedis();
  if (fromRedis) {
    memoryCache = fromRedis;
    memoryCacheAt = now;
    syncSwitchSnapshot(fromRedis);
    return fromRedis;
  }

  const fromMongo = await loadFromMongo();
  if (fromMongo) {
    memoryCache = fromMongo;
    memoryCacheAt = now;
    syncSwitchSnapshot(fromMongo);
    try {
      await redis.set(RUNTIME_CONFIG_REDIS_KEY, JSON.stringify(fromMongo), 'EX', 30);
    } catch {
      /* ignore cache write failure */
    }
    return fromMongo;
  }

  const defaults = buildDefaultConfig();
  memoryCache = defaults;
  memoryCacheAt = now;
  syncSwitchSnapshot(defaults);
  return defaults;
}

/** Zero I/O hot-path read of kill switches (refreshed every 10s). */
export function getRuntimeSwitchesSync(): RuntimeKillSwitches {
  return switchSnapshot;
}

export function getSnapshotVersion(): number {
  return snapshotVersion;
}

export async function refreshRuntimeConfigSnapshot(): Promise<void> {
  const cfg = await getRuntimeConfig();
  syncSwitchSnapshot(cfg);
}

export function startRuntimeConfigRefreshLoop(intervalMs = 10_000): void {
  if (refreshInterval) return;
  refreshInterval = setInterval(() => {
    void refreshRuntimeConfigSnapshot().catch(() => {});
  }, intervalMs);
}

export async function getRuntimeSwitches(): Promise<RuntimeKillSwitches> {
  const cfg = await getRuntimeConfig();
  return cfg.switches;
}

export async function patchRuntimeConfig(
  patch: Partial<RuntimeKillSwitches> & { minAppVersion?: string },
  updatedBy?: string
): Promise<RuntimeConfigDocument> {
  const current = await getRuntimeConfig();
  const next: RuntimeConfigDocument = {
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    minAppVersion: patch.minAppVersion ?? current.minAppVersion,
    switches: {
      ...current.switches,
      ...Object.fromEntries(
        Object.entries(patch).filter(([k]) => k !== 'minAppVersion')
      ) as Partial<RuntimeKillSwitches>,
    },
  };

  const mongoose = await import('mongoose');
  const col = mongoose.connection.db!.collection('admin_config');
  await col.updateOne(
    { key: RUNTIME_CONFIG_MONGO_KEY },
    {
      $set: {
        key: RUNTIME_CONFIG_MONGO_KEY,
        payload: next,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  await redis.set(RUNTIME_CONFIG_REDIS_KEY, JSON.stringify(next), 'EX', 30);
  memoryCache = next;
  memoryCacheAt = Date.now();
  syncSwitchSnapshot(next);
  return next;
}

export function invalidateRuntimeConfigCache(): void {
  memoryCache = null;
  memoryCacheAt = 0;
}
