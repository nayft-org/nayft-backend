import { News } from '../news/model';
import { INews } from '../../types';

export const newsRepository = {
  findAll: async (limit: number = 50, skip: number = 0): Promise<INews[]> => {
    return News.find()
      .sort({ publishedAt: -1 })
      .limit(limit)
      .skip(skip);
  },

  findById: async (newsId: string): Promise<INews | null> => {
    return News.findById(newsId);
  },

  findFollowing: async (followingCoins: string[], limit: number = 50): Promise<INews[]> => {
    return News.find({ relatedCoins: { $in: followingCoins } })
      .sort({ publishedAt: -1 })
      .limit(limit);
  },
};

