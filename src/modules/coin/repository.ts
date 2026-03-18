import { Coin } from '../coin/model';
import { News } from '../news/model';
import { ICoin, INews } from '../../types';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const coinRepository = {
  findById: async (coinId: string): Promise<ICoin | null> => {
    return Coin.findOne({ coinId });
  },

  findBySymbol: async (symbol: string): Promise<ICoin | null> => {
    return Coin.findOne({ symbol: symbol.toUpperCase() });
  },

  searchByQuery: async (query: string, limit: number = 24): Promise<ICoin[]> => {
    const q = escapeRegex(query.trim().toLowerCase());
    if (!q) return [];
    const regex = new RegExp(q, 'i');
    const coins = await Coin.find({
      $or: [
        { symbol: regex },
        { name: regex },
        { coinId: regex },
      ],
    })
      .sort({ rank: 1 })
      .limit(limit)
      .lean<ICoin[]>();
    return coins;
  },

  findNewsByCoinId: async (coinId: string, limit: number = 10): Promise<INews[]> => {
    return News.find({ relatedCoins: coinId })
      .sort({ publishedAt: -1 })
      .limit(limit);
  },
};

