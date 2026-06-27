export const feedRankingRedisKeys = {
  ranked: (userId: string) => `feed:ranked:${userId}`,
  rankRevision: (userId: string) => `feed:rank:revision:${userId}`,
  rankLock: (userId: string) => `feed:rank:lock:${userId}`,
};
