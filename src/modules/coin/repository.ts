import { Coin } from '../coin/model';
import { News } from '../news/model';
import { ICoin, INews } from '../../types';

export const coinRepository = {
  findById: async (coinId: string): Promise<ICoin | null> => {
    return Coin.findOne({ coinId });
  },

  findBySymbol: async (symbol: string): Promise<ICoin | null> => {
    return Coin.findOne({ symbol: symbol.toUpperCase() });
  },

  findNewsByCoinId: async (coinId: string, limit: number = 10): Promise<INews[]> => {
    return News.find({ relatedCoins: coinId })
      .sort({ publishedAt: -1 })
      .limit(limit);
  },
};

