import { config } from '../../config/env';

export type NewsTimingBreakdown = {
  cacheLookupMs: number;
  fetcherMs: number;
  translationMs: number;
  serializeMs: number;
  totalMs: number;
  cacheHit: boolean;
  statusCode: number;
  language: string;
  articleCount: number;
};

const recent: NewsTimingBreakdown[] = [];
const MAX = 100;

export function shouldLogNewsPerf(): boolean {
  return config.nodeEnv !== 'production' || process.env.NEWS_PERF_TRACE === 'true';
}

export function recordNewsTiming(row: NewsTimingBreakdown): void {
  recent.push(row);
  if (recent.length > MAX) recent.shift();
  if (!shouldLogNewsPerf()) return;
  console.info(
    `[news] cache=${row.cacheLookupMs}ms fetcher=${row.fetcherMs}ms translate=${row.translationMs}ms ` +
      `serialize=${row.serializeMs}ms total=${row.totalMs}ms hit=${row.cacheHit} status=${row.statusCode} ` +
      `lang=${row.language} articles=${row.articleCount}`
  );
}

export function getNewsTimingSnapshot(): NewsTimingBreakdown[] {
  return [...recent];
}
