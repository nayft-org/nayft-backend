import { NewsArticle } from '../../news/models/NewsArticle';
import { Coin } from '../../coin/model';
import { CoinSentimentSnapshot } from '../models/CoinSentimentSnapshot';
import { sentimentConfig } from '../config/sentimentConfig';
import {
  setCoinSentimentCached,
  setTrendingSnapshotCached,
  acquireAggregationLock,
  releaseAggregationLock,
  nextSentimentRevision,
  type CoinSentimentCacheDto,
  type SentimentTrendingCacheDto,
} from './sentimentCache.service';
import { sentimentMetrics } from '../../../observability/sentimentMetrics';

function decayWeight(publishedAt: Date, nowMs: number, lambda: number): number {
  const ageHours = Math.max(0, (nowMs - publishedAt.getTime()) / 3_600_000);
  return Math.exp(-lambda * ageHours);
}

type SymbolAgg = {
  symbol: string;
  weightedSum: number;
  weightTotal: number;
  confidenceSum: number;
  bullish: number;
  bearish: number;
  risk: number;
  count: number;
  headlines: Array<{ externalId: string; title: string; score: number; publishedAt: Date; w: number }>;
};

export async function runCoinSentimentAggregation(): Promise<{ symbols: number }> {
  const started = Date.now();
  const locked = await acquireAggregationLock();
  if (!locked) {
    return { symbols: 0 };
  }

  try {
    const now = Date.now();
    const windowHours = sentimentConfig.aggregationWindowHours;
    const from = new Date(now - windowHours * 3_600_000);
    const lambda = sentimentConfig.decayLambda;

    let articles = await NewsArticle.find({
      status: 'active',
      sentimentStatus: 'ready',
      publishedAt: { $gte: from },
      'sentimentAnalysis.score': { $exists: true },
    })
      .select('externalId title publishedAt coins sentimentAnalysis')
      .sort({ publishedAt: -1 })
      .limit(sentimentConfig.maxAggregationArticles + 1)
      .lean();

    if (articles.length > sentimentConfig.maxAggregationArticles) {
      console.warn('[CoinSentimentAgg] article cap reached', {
        cap: sentimentConfig.maxAggregationArticles,
        found: articles.length,
      });
      articles = articles.slice(0, sentimentConfig.maxAggregationArticles);
    }

    const bySymbol = new Map<string, SymbolAgg>();

    for (const article of articles) {
      const analysis = article.sentimentAnalysis;
      if (!analysis) continue;
      const w =
        decayWeight(new Date(article.publishedAt), now, lambda) *
        (analysis.sourceTrust ?? 0.6) *
        (analysis.confidence ?? 0.5);
      if (w <= 0) continue;

      for (const coin of article.coins || []) {
        const symbol = (coin.symbol || '').toUpperCase();
        if (!symbol) continue;
        let agg = bySymbol.get(symbol);
        if (!agg) {
          agg = {
            symbol,
            weightedSum: 0,
            weightTotal: 0,
            confidenceSum: 0,
            bullish: 0,
            bearish: 0,
            risk: 0,
            count: 0,
            headlines: [],
          };
          bySymbol.set(symbol, agg);
        }
        agg.weightedSum += analysis.score * w;
        agg.weightTotal += w;
        agg.confidenceSum += (analysis.confidence ?? 0) * w;
        agg.count += 1;
        const label = analysis.label;
        if (label === 'bullish') agg.bullish += 1;
        else if (label === 'bearish') agg.bearish += 1;
        else if (label === 'risk') agg.risk += 1;
        agg.headlines.push({
          externalId: article.externalId,
          title: article.title,
          score: analysis.score,
          publishedAt: new Date(article.publishedAt),
          w,
        });
      }
    }

    const symbols = [...bySymbol.keys()];
    const coinRows = await Coin.find({ symbol: { $in: symbols } })
      .select('symbol internalCoinId')
      .lean();
    const internalBySymbol = new Map(
      coinRows.map((r) => [(r.symbol || '').toUpperCase(), r.internalCoinId as string | undefined])
    );

    const revision = await nextSentimentRevision();
    const computedAt = new Date();
    const dtos: CoinSentimentCacheDto[] = [];

    for (const agg of bySymbol.values()) {
      const articleCount = agg.count;
      const weightedScore =
        articleCount === 0 || agg.weightTotal <= 0 ? 0 : agg.weightedSum / agg.weightTotal;
      const confidence =
        articleCount === 0 || agg.weightTotal <= 0 ? 0 : agg.confidenceSum / agg.weightTotal;
      const totalLabel = Math.max(1, agg.bullish + agg.bearish + agg.risk);
      const topHeadlines = agg.headlines
        .sort((a, b) => b.w - a.w)
        .slice(0, 5)
        .map((h) => ({
          externalId: h.externalId,
          title: h.title,
          score: h.score,
          publishedAt: h.publishedAt.toISOString(),
        }));

      const dto: CoinSentimentCacheDto = {
        symbol: agg.symbol,
        weightedScore,
        normalizedScore: 0.5,
        confidence,
        articleCount,
        bullishRatio: agg.bullish / totalLabel,
        bearishRatio: agg.bearish / totalLabel,
        riskRatio: agg.risk / totalLabel,
        computedAt: computedAt.toISOString(),
        revision,
        topHeadlines,
      };
      dtos.push(dto);

      await CoinSentimentSnapshot.create({
        symbol: agg.symbol,
        internalCoinId: internalBySymbol.get(agg.symbol),
        computedAt,
        windowHours,
        articleCount,
        weightedScore,
        normalizedScore: 0.5,
        confidence,
        bullishRatio: dto.bullishRatio,
        bearishRatio: dto.bearishRatio,
        riskRatio: dto.riskRatio,
        revision,
        topHeadlines: topHeadlines.map((h) => ({
          ...h,
          publishedAt: new Date(h.publishedAt),
        })),
      });

      await setCoinSentimentCached(agg.symbol, dto);
    }

    if (dtos.length > 0) {
      const sorted = [...dtos].sort((a, b) => b.weightedScore - a.weightedScore);
      const normScores = sorted.map((d) => d.weightedScore);
      const min = Math.min(...normScores);
      const max = Math.max(...normScores);
      for (const d of dtos) {
        d.normalizedScore =
          max === min ? 0.5 : (d.weightedScore - min) / (max - min);
        await setCoinSentimentCached(d.symbol, d);
      }
    }

    const trending: SentimentTrendingCacheDto = {
      generatedAt: computedAt.toISOString(),
      revision,
      topBullish: [...dtos].sort((a, b) => b.weightedScore - a.weightedScore).slice(0, 10),
      topBearish: [...dtos].sort((a, b) => a.weightedScore - b.weightedScore).slice(0, 10),
    };
    await setTrendingSnapshotCached(trending);

    const retentionCutoff = new Date(
      Date.now() - sentimentConfig.snapshotRetentionDays * 24 * 3_600_000
    );
    await CoinSentimentSnapshot.deleteMany({ computedAt: { $lt: retentionCutoff } });

    sentimentMetrics.aggregationDurationMs = Date.now() - started;
    sentimentMetrics.lastAggregationAt = computedAt.toISOString();

    return { symbols: dtos.length };
  } finally {
    await releaseAggregationLock();
  }
}
