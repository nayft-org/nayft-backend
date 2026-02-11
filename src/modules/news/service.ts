import { authRepository } from '../auth/repository';
import { coindeskApi, normalizeArticle, extractTickers } from '../../utils/coindesk';
import { coinRepository } from '../coin/repository';

export const newsService = {
  getAllNews: async (page: number = 1, limit: number = 50) => {
    const articles = await coindeskApi.getLatestNews(page, limit);
    return articles.map(mapCoindeskToDto);
  },

  getFollowingNews: async (userId: string, page: number = 1, limit: number = 50) => {
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

    const articles = await coindeskApi.getNewsByTickers(symbols, page, limit);
    return articles.map(mapCoindeskToDto);
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
