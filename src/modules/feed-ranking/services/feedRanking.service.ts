import { redis } from '../../../config/redis';
import { portfolioIntelligenceFacade } from '../../portfolio-intelligence/services/portfolioIntelligenceFacade.service';
import { feedRankingRedisKeys } from '../cache/feedRankingRedisKeys';
import { confidenceToUnit } from '../../portfolio-intelligence/engines/confidence/portfolioConfidence.engine';

const WEIGHTS = {
  followBoost: 120,
  heldBoost: 80,
  narrativeBoost: 60,
  convictionBoost: 40,
  identityBoost: 25,
  interestCategoryBoost: 35,
  recencyBoost: 40,
};

export type RankableArticle = {
  articleId: string;
  symbols: string[];
  categories: string[];
  publishedAt: string;
  reactionCount?: number;
};

export const feedRankingService = {
  scoreArticle(
    article: RankableArticle,
    feedIntel: Awaited<ReturnType<typeof portfolioIntelligenceFacade.getFeedIntelligenceContext>>,
    interestCategoryAffinity: Record<string, number> = {}
  ): number {
    if (!feedIntel) return WEIGHTS.recencyBoost * 0.5;

    const confMult = feedIntel.portfolioConfidence || confidenceToUnit(800);
    let score = 0;

    for (const sym of article.symbols) {
      if (feedIntel.heldSymbols.includes(sym)) {
        score += WEIGHTS.heldBoost * (feedIntel.weightBySymbol[sym] ?? 0.1);
      }
    }

    for (const cat of article.categories) {
      score += WEIGHTS.narrativeBoost * (feedIntel.narrativeVector[cat] ?? 0) / 100;
      score += WEIGHTS.convictionBoost * (feedIntel.convictionVector[cat] ?? 0);
      score += WEIGHTS.interestCategoryBoost * (interestCategoryAffinity[cat] ?? 0);
      score += (feedIntel.narrativeMomentum[cat] ?? 0) * 30;
    }

    if (article.categories.some((c) => c === feedIntel.identityPrimaryId)) {
      score += WEIGHTS.identityBoost;
    }

    const ageHours = (Date.now() - new Date(article.publishedAt).getTime()) / 3600_000;
    score += WEIGHTS.recencyBoost * Math.exp(-ageHours / 48);

    return score * confMult;
  },

  async rankArticles(
    userId: string,
    articles: RankableArticle[],
    limit = 50
  ): Promise<Array<{ articleId: string; score: number }>> {
    const feedIntel = await portfolioIntelligenceFacade.getFeedIntelligenceContext(userId);
    const scored = articles
      .map((a) => ({
        articleId: a.articleId,
        score: this.scoreArticle(a, feedIntel),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const key = feedRankingRedisKeys.ranked(userId);
    if (scored.length > 0) {
      const pipeline = redis.pipeline();
      pipeline.del(key);
      for (const s of scored) {
        pipeline.zadd(key, s.score, s.articleId);
      }
      pipeline.expire(key, 3600);
      await pipeline.exec();
    }

    return scored;
  },

  async getRankedArticleIds(userId: string, limit = 50): Promise<Array<{ articleId: string; score: number }>> {
    const key = feedRankingRedisKeys.ranked(userId);
    const rows = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    const out: Array<{ articleId: string; score: number }> = [];
    for (let i = 0; i < rows.length; i += 2) {
      out.push({ articleId: rows[i], score: parseFloat(rows[i + 1]) });
    }
    return out;
  },
};
