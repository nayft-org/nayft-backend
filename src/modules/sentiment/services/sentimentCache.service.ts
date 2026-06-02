import { redis } from '../../../config/redis';
import { cacheHelpers } from '../../../config/redis';
import { sentimentConfig } from '../config/sentimentConfig';

export type CoinSentimentCacheDto = {
  symbol: string;
  weightedScore: number;
  normalizedScore: number;
  confidence: number;
  articleCount: number;
  bullishRatio: number;
  bearishRatio: number;
  riskRatio: number;
  computedAt: string;
  revision: number;
  topHeadlines: Array<{ externalId: string; title: string; score: number; publishedAt: string }>;
};

export type SentimentTrendingCacheDto = {
  generatedAt: string;
  revision: number;
  topBullish: CoinSentimentCacheDto[];
  topBearish: CoinSentimentCacheDto[];
};

export function coinCacheKey(symbol: string): string {
  return `${sentimentConfig.coinCachePrefix}${symbol.toUpperCase()}`;
}

export async function getCoinSentimentCached(symbol: string): Promise<CoinSentimentCacheDto | null> {
  return cacheHelpers.get<CoinSentimentCacheDto>(coinCacheKey(symbol));
}

export async function setCoinSentimentCached(symbol: string, dto: CoinSentimentCacheDto): Promise<void> {
  await cacheHelpers.set(coinCacheKey(symbol), dto, sentimentConfig.coinCacheTtlSec);
}

export async function getTrendingSnapshotCached(): Promise<SentimentTrendingCacheDto | null> {
  return cacheHelpers.get<SentimentTrendingCacheDto>(sentimentConfig.snapshotKey);
}

export async function setTrendingSnapshotCached(dto: SentimentTrendingCacheDto): Promise<void> {
  await cacheHelpers.set(sentimentConfig.snapshotKey, dto, sentimentConfig.snapshotCacheTtlSec);
}

export async function acquireAggregationLock(): Promise<boolean> {
  const result = await redis.set(
    sentimentConfig.buildLockKey,
    String(Date.now()),
    'EX',
    sentimentConfig.buildLockTtlSec,
    'NX'
  );
  return result === 'OK';
}

export async function releaseAggregationLock(): Promise<void> {
  await redis.del(sentimentConfig.buildLockKey);
}

export async function nextSentimentRevision(): Promise<number> {
  return redis.incr(sentimentConfig.revisionKey);
}
