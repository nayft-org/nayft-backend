import { Coin } from '../coin/model';
import { News } from '../news/model';
import { ICoin, INews } from '../../types';
import { tokenize, buildTokenAndMatch, scoreMatch } from '../search/queryTokens';

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
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    // Every query word must appear (word-boundary) in the symbol or name, in any order,
    // so multi-word/out-of-order queries still match instead of requiring one anchored prefix.
    const candidates = await Coin.find(buildTokenAndMatch(['symbolLower', 'nameLower'], tokens))
      .sort({ rank: 1 })
      .limit(limit * 5)
      .maxTimeMS(200)
      .lean<ICoin[]>();

    return candidates
      .map((coin) => ({ coin, score: scoreMatch(tokens, [coin.symbolLower, coin.nameLower]) }))
      .sort((a, b) => b.score - a.score || (a.coin.rank ?? 0) - (b.coin.rank ?? 0))
      .slice(0, limit)
      .map(({ coin }) => coin);
  },

  findNewsByCoinId: async (coinId: string, limit: number = 10): Promise<INews[]> => {
    return News.find({ relatedCoins: coinId })
      .sort({ publishedAt: -1 })
      .limit(limit);
  },
};
