import { riskConfig } from '../config/riskConfig';
import type { NewsFactorFlag, NewsFactorResult } from '../types';

const NEUTRAL_NORMALIZED = 0.5;

export type CoinSentimentSnapshotInput = {
  weightedScore: number;
  normalizedScore: number;
  confidence: number;
  articleCount: number;
  revision: number;
  computedAt: Date;
};

export function applyNewsFactorGating(
  symbol: string,
  snap: CoinSentimentSnapshotInput | null,
  options?: { rrsEnabled?: boolean; nowMs?: number }
): NewsFactorResult {
  const upper = symbol.toUpperCase();
  const flags: NewsFactorFlag[] = [];
  const rrsEnabled = options?.rrsEnabled ?? riskConfig.sentimentRrsEnabled;
  const nowMs = options?.nowMs ?? Date.now();

  if (!rrsEnabled) {
    return {
      symbol: upper,
      newsRaw: 0,
      newsNormalized: NEUTRAL_NORMALIZED,
      confidence: 0,
      articleCount: 0,
      revision: null,
      computedAt: null,
      flags: ['disabled'],
    };
  }

  if (!snap) {
    return {
      symbol: upper,
      newsRaw: 0,
      newsNormalized: NEUTRAL_NORMALIZED,
      confidence: 0,
      articleCount: 0,
      revision: null,
      computedAt: null,
      flags: ['no_news'],
    };
  }

  const ageMs = nowMs - snap.computedAt.getTime();
  if (ageMs > riskConfig.newsStaleMs) {
    flags.push('stale_sentiment');
    return {
      symbol: upper,
      newsRaw: snap.weightedScore,
      newsNormalized: NEUTRAL_NORMALIZED,
      confidence: 0,
      articleCount: snap.articleCount,
      revision: snap.revision,
      computedAt: snap.computedAt.toISOString(),
      flags,
    };
  }

  if (snap.articleCount < riskConfig.newsMinArticleCount) {
    flags.push('low_confidence');
    return {
      symbol: upper,
      newsRaw: snap.weightedScore,
      newsNormalized: NEUTRAL_NORMALIZED,
      confidence: Math.min(snap.confidence, 0.2),
      articleCount: snap.articleCount,
      revision: snap.revision,
      computedAt: snap.computedAt.toISOString(),
      flags,
    };
  }

  if (snap.confidence < riskConfig.newsConfidenceThreshold) {
    flags.push('low_confidence');
    return {
      symbol: upper,
      newsRaw: snap.weightedScore,
      newsNormalized: NEUTRAL_NORMALIZED,
      confidence: snap.confidence,
      articleCount: snap.articleCount,
      revision: snap.revision,
      computedAt: snap.computedAt.toISOString(),
      flags,
    };
  }

  flags.push('ready');
  return {
    symbol: upper,
    newsRaw: snap.weightedScore,
    newsNormalized: snap.normalizedScore,
    confidence: snap.confidence,
    articleCount: snap.articleCount,
    revision: snap.revision,
    computedAt: snap.computedAt.toISOString(),
    flags,
  };
}
