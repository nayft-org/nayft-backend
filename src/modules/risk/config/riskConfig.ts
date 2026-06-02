function parseBool(envKey: string, defaultValue: boolean): boolean {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return defaultValue;
  return raw.toLowerCase() === 'true' || raw === '1';
}

export const riskConfig = {
  /** When false, NEWS factor returns neutral 0.5 with zero confidence. */
  sentimentRrsEnabled: parseBool('SENTIMENT_RRS_ENABLED', false),
  /** Minimum snapshot confidence to use non-neutral NEWS score. */
  newsConfidenceThreshold: parseFloat(process.env.RRS_NEWS_CONFIDENCE_THRESHOLD || '0.3'),
  /** Minimum articles in aggregation window. */
  newsMinArticleCount: parseInt(process.env.RRS_NEWS_MIN_ARTICLE_COUNT || '2', 10),
  /** Stale snapshot age (ms) beyond which NEWS factor decays to neutral. */
  newsStaleMs: parseInt(process.env.RRS_NEWS_STALE_MS || String(72 * 3_600_000), 10),
};
