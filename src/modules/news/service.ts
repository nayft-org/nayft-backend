import { newsRepository } from './repository';
import { authRepository } from '../auth/repository';
import { seedGeneralNews } from '../../utils/seedGeneralNews';

export const newsService = {
  getAllNews: async (page: number = 1, limit: number = 50) => {
    // Seed general news if database is empty
    const existingNews = await newsRepository.findAll(1, 0);
    if (existingNews.length === 0) {
      await seedGeneralNews();
    }
    
    const skip = (page - 1) * limit;
    const news = await newsRepository.findAll(limit, skip);
    return news.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      summary: item.summary,
      source: item.source,
      url: item.url,
      image: item.image,
      relatedCoins: item.relatedCoins,
      publishedAt: item.publishedAt,
    }));
  },

  getFollowingNews: async (userId: string, page: number = 1, limit: number = 50) => {
    const user = await authRepository.findById(userId);
    if (!user || !user.followingCoins || user.followingCoins.length === 0) {
      return [];
    }

    // Note: findFollowing doesn't support skip, so pagination is limited
    // For now, we'll just use limit. Can be enhanced later.
    const news = await newsRepository.findFollowing(user.followingCoins, limit * page);
    // Apply manual pagination
    const skip = (page - 1) * limit;
    const paginatedNews = news.slice(skip, skip + limit);
    return paginatedNews.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      summary: item.summary,
      source: item.source,
      url: item.url,
      image: item.image,
      relatedCoins: item.relatedCoins,
      publishedAt: item.publishedAt,
    }));
  },

  getNewsDetail: async (newsId: string) => {
    const news = await newsRepository.findById(newsId);
    if (!news) {
      throw new Error('News not found');
    }

    return {
      id: news._id.toString(),
      title: news.title,
      summary: news.summary,
      source: news.source,
      url: news.url,
      image: news.image,
      relatedCoins: news.relatedCoins,
      publishedAt: news.publishedAt,
    };
  },
};

