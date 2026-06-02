export type NewsFactorFlag = 'no_news' | 'stale_sentiment' | 'low_confidence' | 'disabled' | 'ready';

export type NewsFactorResult = {
  symbol: string;
  /** Raw decay-weighted score -1..+1 from coin sentiment snapshot. */
  newsRaw: number;
  /** Cross-sectional normalized 0..1 for CRS percentile rank. */
  newsNormalized: number;
  /** Effective confidence 0..1 after gating. */
  confidence: number;
  articleCount: number;
  revision: number | null;
  computedAt: string | null;
  flags: NewsFactorFlag[];
};
