import { Coin } from '../coin/model';
import { News } from '../news/model';
import { ICoin, INews } from '../../types';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const coinRepository = {
  findByInternalId: async (internalCoinId: string): Promise<ICoin | null> => {
    return Coin.findOne({ internalCoinId });
  },

  findById: async (coinId: string): Promise<ICoin | null> => {
    return Coin.findOne({ coinId });
  },

  findByIds: async (coinIds: string[]): Promise<ICoin[]> => {
    if (coinIds.length === 0) return [];
    return Coin.find({ coinId: { $in: coinIds } }).lean<ICoin[]>();
  },

  findBySymbol: async (symbol: string): Promise<ICoin | null> => {
    return Coin.findOne({ symbol: symbol.toUpperCase() });
  },

  findBySymbols: async (symbols: string[]): Promise<ICoin[]> => {
    if (symbols.length === 0) return [];
    const upperSymbols = symbols.map(s => s.toUpperCase());
    return Coin.find({ symbol: { $in: upperSymbols } }).lean<ICoin[]>();
  },

  searchByQuery: async (query: string, limit: number = 24): Promise<ICoin[]> => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Use prefix match on indexed lowercase fields for better performance
    return Coin.find({
      $or: [
        { symbolLower: { $regex: `^${escapeRegex(q)}` } },
        { nameLower: { $regex: `^${escapeRegex(q)}` } },
      ],
    })
      .sort({ rank: 1 })
      .limit(limit)
      .lean<ICoin[]>();
  },

  findNewsByCoinId: async (coinId: string, limit: number = 10): Promise<INews[]> => {
    return News.find({ relatedCoins: coinId })
      .sort({ publishedAt: -1 })
      .limit(limit);
  },
};
