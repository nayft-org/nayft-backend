import { CoinSentimentSnapshot } from '../../sentiment/models/CoinSentimentSnapshot';
import { getCoinSentimentCached } from '../../sentiment/services/sentimentCache.service';
import { applyNewsFactorGating } from './newsFactorLogic';
import type { NewsFactorResult } from '../types';

export async function loadLatestCoinSentiment(symbol: string): Promise<{
  weightedScore: number;
  normalizedScore: number;
  confidence: number;
  articleCount: number;
  revision: number;
  computedAt: Date;
} | null> {
  const upper = symbol.toUpperCase();
  const cached = await getCoinSentimentCached(upper);
  if (cached) {
    return {
      weightedScore: cached.weightedScore,
      normalizedScore: cached.normalizedScore,
      confidence: cached.confidence,
      articleCount: cached.articleCount,
      revision: cached.revision ?? 0,
      computedAt: new Date(cached.computedAt),
    };
  }

  const latest = await CoinSentimentSnapshot.findOne({ symbol: upper })
    .sort({ computedAt: -1 })
    .lean();
  if (!latest) return null;

  return {
    weightedScore: latest.weightedScore,
    normalizedScore: latest.normalizedScore,
    confidence: latest.confidence,
    articleCount: latest.articleCount,
    revision: latest.revision,
    computedAt: latest.computedAt,
  };
}

/**
 * NEWS factor for CRS — neutral 0.5 when disabled, missing, stale, or low confidence.
 */
export async function computeNewsFactor(symbol: string): Promise<NewsFactorResult> {
  const snap = await loadLatestCoinSentiment(symbol);
  return applyNewsFactorGating(symbol, snap);
}
