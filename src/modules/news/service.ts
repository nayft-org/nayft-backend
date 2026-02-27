import { authRepository } from '../auth/repository';
import { coindeskApi, normalizeArticle, extractTickers } from '../../utils/coindesk';
import { coinRepository } from '../coin/repository';
import { NewsArticle } from './models';
import type { INewsArticle } from './models/NewsArticle';
import { reactionService } from '../reaction/service';
import type { ReactionType } from '../reaction/model';

const ALLOWED_NEWS_CATEGORIES = new Set([
  'BTC',
  'ETH',
  'FIAT',
  'MARKET',
  'CRYPTOCURRENCY',
]);

const filterByCategories = (articles: any[], categories: string[]): any[] => {
  if (!categories.length) return articles;
  const allowed = new Set(
    categories
      .map((c) => c.toUpperCase())
      .filter((c) => ALLOWED_NEWS_CATEGORIES.has(c))
  );
  if (!allowed.size) return articles;

  return articles.filter((raw) => {
    const article = normalizeArticle(raw);
    if (!article.categories || !article.categories.length) return false;
    return article.categories.some((cat) => allowed.has(cat.toUpperCase()));
  });
};

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
  return {
    id: article.externalId,
    title: article.title || 'Untitled',
    summary: article.subtitle || '',
    subtitle: article.subtitle || '',
    source: article.source?.name || 'Unknown',
    sourceUrl: article.sourceUrl,
    url: article.sourceUrl,
    image: article.imageUrl,
    relatedCoins,
    categories,
    publishedAt: article.publishedAt,
    saveCount: article.metrics?.saves ?? 0,
    comments: article.metrics?.comments ?? 0,
    reactions,
    userReaction: userReaction ?? null,
  };
};

export const newsService = {
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

    const articles = await NewsArticle.find(query)
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
    categories: string[] = []
  ) => {
    const user = await authRepository.findById(userId);
    if (!user || !user.followingCoins || user.followingCoins.length === 0) {
      return [];
    }

    // Map following coin IDs to symbols
    const symbols: string[] = [];
    for (const coinId of user.followingCoins) {
      const coin = await coinRepository.findById(coinId);
      if (coin?.symbol) {
        symbols.push(coin.symbol);
      }
    }

    if (symbols.length === 0) {
      return [];
    }

    const articles = await coindeskApi.getNewsByTickers(symbols, page, limit * 2);
    const filtered = filterByCategories(articles, categories);
    return filtered.slice(0, limit).map(mapCoindeskToDto);
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
      return mapNewsArticleToDto(dbArticle, userReaction);
    }

    const article = await coindeskApi.getArticleById(newsId);
    if (!article) {
      throw new Error('News not found');
    }

    return mapCoindeskToDto(article);
  },
};

const mapCoindeskToDto = (articleRaw: any) => {
  const article = normalizeArticle(articleRaw);
  const relatedCoins = extractTickers(article).map((t) => t.toUpperCase());

  return {
    id: article.id,
    title: article.title || article.headline || 'Untitled',
    summary: article.summary || article.description || '',
    source: article.source || 'CoinDesk',
    url: article.url,
    image: article.imageUrl,
    relatedCoins,
    publishedAt: new Date(article.publishedAt),
  };
};
