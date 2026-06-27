import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { requireEmailVerified } from '../auth/middleware/requireEmailVerified';
import { AuthRequest } from '../../types';
import { sendSuccess, sendError } from '../../utils/response';
import { feedRankingService } from './services/feedRanking.service';
import { featureService } from '../../core/feature-system/feature.service';

const router = Router();
router.use(authenticate, requireEmailVerified);

router.get('/ranked', async (req: AuthRequest, res) => {
  try {
    const enabled = await featureService.isActive('feed_ranking_server');
    if (!enabled) {
      sendError(res, 'Server feed ranking is not enabled', 403);
      return;
    }
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const ranked = await feedRankingService.getRankedArticleIds(req.userId!, limit);
    sendSuccess(res, { ranked, mode: req.query.mode ?? 'following' });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : 'Failed to load ranked feed', 500);
  }
});

router.post('/ranked', async (req: AuthRequest, res) => {
  try {
    const enabled = await featureService.isActive('feed_ranking_server');
    if (!enabled) {
      sendError(res, 'Server feed ranking is not enabled', 403);
      return;
    }
    const limit = Math.min(parseInt(String(req.body?.limit || '50'), 10) || 50, 200);
    const articles = Array.isArray(req.body?.articles) ? req.body.articles : [];
    const ranked = await feedRankingService.rankArticles(
      req.userId!,
      articles.map((a: Record<string, unknown>) => ({
        articleId: String(a.articleId ?? ''),
        symbols: Array.isArray(a.symbols) ? a.symbols.map(String) : [],
        categories: Array.isArray(a.categories) ? a.categories.map(String) : [],
        publishedAt: String(a.publishedAt ?? new Date().toISOString()),
        reactionCount: typeof a.reactionCount === 'number' ? a.reactionCount : undefined,
      })),
      limit
    );
    sendSuccess(res, { ranked, mode: req.body?.mode ?? 'following' });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : 'Failed to rank feed', 500);
  }
});

export default router;
