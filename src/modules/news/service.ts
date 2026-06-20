import { coindeskApi, normalizeArticle, extractTickers } from '../../utils/coindesk';
import { NewsArticle } from './models';
import { eventService } from '../../core/event-system';
import type { INewsArticle } from './models/NewsArticle';
import { reactionService } from '../reaction/service';
import type { ReactionType } from '../reaction/model';
import { Reaction } from '../reaction/model';
import { Comment } from '../comment/model';
import { NewsBoard } from '../newsboard/model';
import { followService } from '../follow/service';
import { resolveFollowSymbolsForTargets } from '../follow/resolveFollowSymbols';
import { buildShareMeta } from './shareMeta';

const LIST_PROJECTION =
  'externalId title subtitle imageUrl sourceUrl publishedAt source categories coins metrics sentiment sentimentStatus sentimentAnalysis';

const ALLOWED_NEWS_CATEGORIES = new Set([
  'BTC',
  'ETH',
  'FIAT',
  'MARKET',
  'CRYPTOCURRENCY',
]);

function deriveDomainFromUrl(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

const mapNewsArticleToDto = (
  article: INewsArticle,
  userReaction?: ReactionType | null
) => {
  const relatedCoins = (article.coins || []).map((c) => c.symbol.toUpperCase());
  const categories = (article.categories || []).map((c) => ({ key: c.key, name: c.name }));
  const r = (article.metrics as any)?.reactions;
  const reactions = {
    appreciate: r?.appreciate ?? 0,
    insightful: r?.insightful ?? 0,
    bullish: r?.bullish ?? 0,
    risk: r?.risk ?? 0,
    deepDive: r?.deepDive ?? 0,
    debatable: r?.debatable ?? 0,
    total: r?.total ?? 0,
  };

  const sourceName = article.source?.name || 'Unknown';
  const sourceKey = article.source?.key || '';
  const sourceDomain = article.source?.domain || deriveDomainFromUrl(article.sourceUrl);
  const sourceLogoUrl = article.source?.logoUrl ?? null;
  const trustCategory = article.source?.trustCategory ?? 'unknown';
  const shareMeta = buildShareMeta({
    externalId: article.externalId,
    sourceUrl: article.sourceUrl,
    imageUrl: article.imageUrl,
  });

  return {
    id: article.externalId,
    title: article.title || 'Untitled',
    summary: article.subtitle || '',
    subtitle: article.subtitle || '',
    // Deprecated flat field — kept for backward compatibility with older clients
    source: sourceName,
    sourceUrl: article.sourceUrl,
    url: article.sourceUrl,
    image: article.imageUrl,
    // Structured source branding (forward-compatible)
    sourceInfo: {
      sourceKey,
      name: sourceName,
      domain: sourceDomain,
      logoUrl: sourceLogoUrl,
      trustCategory,
      // Reserved extension blocks for future share cards / Socialyx (not populated in Phase 1)
      branding: undefined as undefined,
    },
    shareMeta,
    relatedCoins,
    categories,
    publishedAt: article.publishedAt,
    saveCount: article.metrics?.saves ?? 0,
    comments: article.metrics?.comments ?? 0,
    reactions,
    userReaction: userReaction ?? null,
    ...(article.sentimentStatus === 'ready' && article.sentimentAnalysis
      ? {
          sentiment: article.sentiment,
          sentimentScore: article.sentimentAnalysis.score,
        }
      : {}),
  };
};

/** Escape user input for safe use inside MongoDB `$regex` (ReDoS mitigation). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type NewsArticleSearchDto = ReturnType<typeof mapNewsArticleToDto>;

export const newsService = {
  /**
   * Indexed NewsArticle search for unified `/api/search` (not getAllNews + filter).
   * Stage A: prefix match on title, subtitle, coins.symbol. Stage B (optional): contains on title/subtitle.
   */
  searchArticlesForUnifiedSearch: async (
    query: string,
    limit: number,
    userId?: string,
    maxTimeMS = 220
  ): Promise<{ articles: NewsArticleSearchDto[]; usedStageB: boolean }> => {
    const cap = Math.min(Math.max(1, limit), 25);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return { articles: [], usedStageB: false };
    }

    const escaped = escapeRegex(trimmed);
    if (!escaped) {
      return { articles: [], usedStageB: false };
    }

    const base: Record<string, unknown> = { status: 'active' };
    const prefixOr: Record<string, unknown>[] = [
      { title: { $regex: `^${escaped}`, $options: 'i' } },
      { subtitle: { $regex: `^${escaped}`, $options: 'i' } },
      { 'coins.symbol': { $regex: `^${escaped}`, $options: 'i' } },
    ];

    let articles = await NewsArticle.find({ ...base, $or: prefixOr })
      .sort({ publishedAt: -1 })
      .limit(cap)
      .maxTimeMS(maxTimeMS)
      .lean<INewsArticle[]>();

    let usedStageB = false;
    if (articles.length < cap && trimmed.length >= 3) {
      const seen = new Set(articles.map((a) => a.externalId));
      const containsOr: Record<string, unknown>[] = [
        { title: { $regex: escaped, $options: 'i' } },
        { subtitle: { $regex: escaped, $options: 'i' } },
      ];
      const more = await NewsArticle.find({
        ...base,
        externalId: { $nin: [...seen] },
        $or: containsOr,
      })
        .sort({ publishedAt: -1 })
        .limit(cap - articles.length)
        .maxTimeMS(maxTimeMS)
        .lean<INewsArticle[]>();

      if (more.length > 0) {
        usedStageB = true;
      }
      const merged = [...articles, ...more].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
      articles = merged.slice(0, cap);
    }

    let userReactionsMap: Record<string, ReactionType> = {};
    if (userId && articles.length > 0) {
      const newsIds = articles.map((a) => a.externalId);
      userReactionsMap = await reactionService.getUserReactionsForArticles(userId, newsIds);
    }

    const dtos = articles.map((a) => mapNewsArticleToDto(a, userReactionsMap[a.externalId]));
    return { articles: dtos, usedStageB };
  },

  getAllNews: async (page: number = 1, limit: number = 50, categories: string[] = [], userId?: string) => {
    const skip = (page - 1) * limit;
    const allowedCategoryKeys =
      categories.length > 0
        ? categories
            .map((c) => c.toUpperCase())
            .filter((c) => ALLOWED_NEWS_CATEGORIES.has(c))
            .map((c) => c.toLowerCase())
        : [];

    const query: Record<string, unknown> = { status: 'active' };
    if (allowedCategoryKeys.length > 0) {
      query['categories.key'] = { $in: allowedCategoryKeys };
    }

    if (userId) {
      const followCoinIds = await followService.getFollowedCoinIds(userId);
      const followedSymbols = await resolveFollowSymbolsForTargets(followCoinIds);
      if (followedSymbols.length > 0) {
        query['coins.symbol'] = { $nin: followedSymbols };
      }
    }

    const articles = await NewsArticle.find(query)
      .select(LIST_PROJECTION)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<INewsArticle[]>();

    let userReactionsMap: Record<string, ReactionType> = {};
    if (userId && articles.length > 0) {
      const newsIds = articles.map((a) => a.externalId);
      userReactionsMap = await reactionService.getUserReactionsForArticles(userId, newsIds);
    }

    return articles.map((a) => mapNewsArticleToDto(a, userReactionsMap[a.externalId]));
  },

  getFollowingNews: async (
    userId: string,
    page: number = 1,
    limit: number = 50,
    categories: string[] = [],
    mode: 'all' | 'coin' | 'users' = 'all'
  ) => {
    const allowedCategoryKeys =
      categories.length > 0
        ? categories
            .map((c) => c.toUpperCase())
            .filter((c) => ALLOWED_NEWS_CATEGORIES.has(c))
            .map((c) => c.toLowerCase())
        : [];

    const [followCoinIds, followUserIds] = await Promise.all([
      mode === 'users' ? Promise.resolve([] as string[]) : followService.getFollowedCoinIds(userId),
      mode === 'coin' ? Promise.resolve([] as string[]) : followService.getFollowedUserIds(userId),
    ]);

    const candidateExternalIds = new Set<string>();
    const originByNewsId = new Map<string, 'coin' | 'user' | 'both'>();

    const coinBranch =
      followCoinIds.length > 0
        ? (async () => {
            const symbols = await resolveFollowSymbolsForTargets(followCoinIds);
            if (symbols.length === 0) return;
            const coinQuery: Record<string, unknown> = {
              status: 'active',
              'coins.symbol': { $in: symbols },
            };
            if (allowedCategoryKeys.length > 0) {
              coinQuery['categories.key'] = { $in: allowedCategoryKeys };
            }
            const coinArticles = await NewsArticle.find(coinQuery)
              .sort({ publishedAt: -1 })
              .limit(limit * 2)
              .select('externalId')
              .lean<Array<{ externalId: string }>>();
            for (const article of coinArticles) {
              candidateExternalIds.add(article.externalId);
              originByNewsId.set(article.externalId, 'coin');
            }
          })()
        : Promise.resolve();

    const userBranch =
      followUserIds.length > 0
        ? (async () => {
            const recentUserNewsIds = await getRecentNewsIdsEngagedByUsers(followUserIds, limit * 3);
            for (const newsId of recentUserNewsIds) {
              candidateExternalIds.add(newsId);
              const existingOrigin = originByNewsId.get(newsId);
              originByNewsId.set(newsId, existingOrigin === 'coin' ? 'both' : 'user');
            }
          })()
        : Promise.resolve();

    await Promise.all([coinBranch, userBranch]);

    if (candidateExternalIds.size === 0) {
      return [];
    }

    const query: Record<string, unknown> = {
      status: 'active',
      externalId: { $in: Array.from(candidateExternalIds) },
    };
    if (allowedCategoryKeys.length > 0) {
      query['categories.key'] = { $in: allowedCategoryKeys };
    }

    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const articles = await NewsArticle.find(query)
      .select(LIST_PROJECTION)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<INewsArticle[]>();

    let userReactionsMap: Record<string, ReactionType> = {};
    if (articles.length > 0) {
      userReactionsMap = await reactionService.getUserReactionsForArticles(
        userId,
        articles.map((a) => a.externalId)
      );
    }

    return articles.map((article) => ({
      ...mapNewsArticleToDto(article, userReactionsMap[article.externalId]),
      origin: originByNewsId.get(article.externalId) || 'coin',
    }));
  },

  getNewsByCoinSymbol: async (coinSymbol: string, limit: number = 20) => {
    const symbolUpper = coinSymbol.trim().toUpperCase();
    if (!symbolUpper) return [];

    const escaped = symbolUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const articles = await NewsArticle.find({
      status: 'active',
      'coins.symbol': { $regex: new RegExp(`^${escaped}$`, 'i') },
    })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean<INewsArticle[]>();

    return articles.map((a) => mapNewsArticleToDto(a, undefined));
  },

  getNewsDetail: async (newsId: string, userId?: string) => {
    const dbArticle = await NewsArticle.findOne({ externalId: newsId }).lean<INewsArticle>();
    if (dbArticle) {
      let userReaction: ReactionType | null = null;
      if (userId) {
        const map = await reactionService.getUserReactionsForArticles(userId, [newsId]);
        userReaction = map[newsId] ?? null;
      }
      eventService.emitEvent({
        featureKey: 'news_feed',
        eventType: 'article_viewed',
        userId,
        metadata: { newsId },
      }).catch(() => {});
      return mapNewsArticleToDto(dbArticle, userReaction);
    }

    const article = await coindeskApi.getArticleById(newsId);
    if (!article) {
      throw new Error('News not found');
    }

    eventService.emitEvent({
      featureKey: 'news_feed',
      eventType: 'article_viewed',
      userId,
      metadata: { newsId },
    }).catch(() => {});

    return mapCoindeskToDto(article);
  },
};

const mapCoindeskToDto = (articleRaw: any) => {
  const article = normalizeArticle(articleRaw);
  const relatedCoins = extractTickers(article).map((t) => t.toUpperCase());
  const sourceName = article.source || 'CoinDesk';
  const sourceDomain = article.url ? deriveDomainFromUrl(article.url) : 'coindesk.com';
  const publisherUrl = article.url || '';
  const shareMeta = publisherUrl
    ? buildShareMeta({
        externalId: article.id,
        sourceUrl: publisherUrl,
        imageUrl: article.imageUrl,
      })
    : undefined;

  return {
    id: article.id,
    title: article.title || article.headline || 'Untitled',
    summary: article.summary || article.description || '',
    source: sourceName,
    sourceInfo: {
      sourceKey: sourceDomain.split('.')[0] || 'coindesk',
      name: sourceName,
      domain: sourceDomain,
      logoUrl: null as null,
      trustCategory: 'unknown' as const,
      branding: undefined as undefined,
    },
    shareMeta,
    url: article.url,
    image: article.imageUrl,
    relatedCoins,
    publishedAt: new Date(article.publishedAt),
  };
};

const getRecentNewsIdsEngagedByUsers = async (
  userIds: string[],
  maxItems: number
): Promise<string[]> => {
  if (userIds.length === 0 || maxItems <= 0) return [];

  const [reactionRows, commentRows, boards] = await Promise.all([
    Reaction.find({ userId: { $in: userIds }, targetType: 'news' })
      .sort({ updatedAt: -1 })
      .limit(maxItems)
      .select('targetId')
      .lean<Array<{ targetId: string }>>(),
    Comment.find({ userId: { $in: userIds } })
      .sort({ createdAt: -1 })
      .limit(maxItems)
      .select('newsId')
      .lean<Array<{ newsId: string }>>(),
    NewsBoard.find({ userId: { $in: userIds } })
      .sort({ updatedAt: -1 })
      .limit(Math.max(20, Math.floor(maxItems / 2)))
      .select('newsIds')
      .lean<Array<{ newsIds: string[] }>>(),
  ]);

  const ranked = new Map<string, number>();
  const pushRank = (newsId: string) => {
    if (!newsId) return;
    ranked.set(newsId, (ranked.get(newsId) || 0) + 1);
  };

  for (const row of reactionRows) pushRank(row.targetId);
  for (const row of commentRows) pushRank(row.newsId);
  for (const board of boards) {
    for (const newsId of board.newsIds || []) pushRank(newsId);
  }

  return Array.from(ranked.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([newsId]) => newsId);
};
