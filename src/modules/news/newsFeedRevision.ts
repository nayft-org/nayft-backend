import { redis } from '../../config/redis';

const REVISION_KEY = 'news:feed:revision:v1';

export async function getNewsFeedRevision(): Promise<number> {
  try {
    const raw = await redis.get(REVISION_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function bumpNewsFeedRevision(): Promise<number> {
  try {
    return await redis.incr(REVISION_KEY);
  } catch {
    return 0;
  }
}
