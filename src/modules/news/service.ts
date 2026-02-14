import { authRepository } from '../auth/repository';
import { coindeskApi, normalizeArticle, extractTickers } from '../../utils/coindesk';
import { coinRepository } from '../coin/repository';

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

export const newsService = {
  getAllNews: async (page: number = 1, limit: number = 50, categories: string[] = []) => {
    const articles = await coindeskApi.getLatestNews(page, limit * 2); // fetch extra, then filter
    const filtered = filterByCategories(articles, categories);
    return filtered.slice(0, limit).map(mapCoindeskToDto);
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

  getNewsDetail: async (newsId: string) => {
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
