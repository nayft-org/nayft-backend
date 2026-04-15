import { redis } from '../../config/redis';
import type { MarketSnapshotV2 } from './snapshotTypes';
import { MARKET_SNAPSHOT_V2_KEY } from './snapshotRedisKeys';

export const snapshotService = {
  /** Read-only: Redis `market:v2:snapshot` JSON. No CMC, no DB in request path. */
  async getSnapshot(): Promise<MarketSnapshotV2 | null> {
    const raw = await redis.get(MARKET_SNAPSHOT_V2_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MarketSnapshotV2;
    } catch {
      return null;
    }
  },
};
