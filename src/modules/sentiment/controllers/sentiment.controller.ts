import { Request, Response } from 'express';
import { sentimentConfig } from '../config/sentimentConfig';
import {
  getCoinSentimentCached,
  getTrendingSnapshotCached,
} from '../services/sentimentCache.service';
import { CoinSentimentSnapshot } from '../models/CoinSentimentSnapshot';

export const sentimentController = {
  getCoinSentiment: async (req: Request, res: Response): Promise<void> => {
    if (!sentimentConfig.apiEnabled) {
      res.status(503).json({ success: false, error: 'Sentiment API disabled' });
      return;
    }
    const symbol = String(req.params.symbol || '').toUpperCase();
    if (!symbol) {
      res.status(400).json({ success: false, error: 'symbol required' });
      return;
    }

    let cached = await getCoinSentimentCached(symbol);
    if (!cached) {
      const latest = await CoinSentimentSnapshot.findOne({ symbol })
        .sort({ computedAt: -1 })
        .lean();
      if (latest) {
        cached = {
          symbol: latest.symbol,
          weightedScore: latest.weightedScore,
          normalizedScore: latest.normalizedScore,
          confidence: latest.confidence,
          articleCount: latest.articleCount,
          bullishRatio: latest.bullishRatio,
          bearishRatio: latest.bearishRatio,
          riskRatio: latest.riskRatio,
          computedAt: latest.computedAt.toISOString(),
          revision: latest.revision,
          topHeadlines: (latest.topHeadlines || []).map((h) => ({
            externalId: h.externalId,
            title: h.title,
            score: h.score,
            publishedAt: new Date(h.publishedAt).toISOString(),
          })),
        };
      }
    }

    if (!cached) {
      res.json({
        success: true,
        data: {
          symbol,
          weightedScore: 0,
          confidence: 0,
          articleCount: 0,
          bullishRatio: 0,
          bearishRatio: 0,
          riskRatio: 0,
          topHeadlines: [],
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        symbol: cached.symbol,
        weightedScore: cached.weightedScore,
        normalizedScore: cached.normalizedScore,
        confidence: cached.confidence,
        articleCount: cached.articleCount,
        bullishRatio: cached.bullishRatio,
        bearishRatio: cached.bearishRatio,
        riskRatio: cached.riskRatio,
        computedAt: cached.computedAt,
        revision: cached.revision,
        topHeadlines: cached.topHeadlines,
      },
    });
  },

  getTrending: async (_req: Request, res: Response): Promise<void> => {
    if (!sentimentConfig.apiEnabled) {
      res.status(503).json({ success: false, error: 'Sentiment API disabled' });
      return;
    }
    const snapshot = await getTrendingSnapshotCached();
    res.json({ success: true, data: snapshot ?? { generatedAt: null, revision: 0, topBullish: [], topBearish: [] } });
  },
};
