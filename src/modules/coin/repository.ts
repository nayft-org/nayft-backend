import { Coin } from '../coin/model';
import { News } from '../news/model';
import { ICoin, INews } from '../../types';
import mongoose from 'mongoose';
import { config } from '../../config/env';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const coinRepository = {
  findByInternalId: async (internalCoinId: string): Promise<ICoin | null> => {
    return Coin.findOne({ internalCoinId });
  },

  findById: async (coinId: string): Promise<ICoin | null> => {
    const byNew = await Coin.findOne({ coinId });
    if (byNew || config.coinDataReadFromNewCollections) return byNew;
    const db = mongoose.connection.db;
    if (!db) return byNew;
    const legacy = await db.collection('coins').findOne({ coinId });
    return legacy as ICoin | null;
  },

  findByIds: async (coinIds: string[]): Promise<ICoin[]> => {
    if (coinIds.length === 0) return [];
    const byNew = await Coin.find({ coinId: { $in: coinIds } }).lean<ICoin[]>();
    if (byNew.length > 0 || config.coinDataReadFromNewCollections) return byNew;
    const db = mongoose.connection.db;
    if (!db) return byNew;
    const legacy = await db.collection('coins').find({ coinId: { $in: coinIds } }).toArray();
    return legacy as ICoin[];
  },

  findBySymbol: async (symbol: string): Promise<ICoin | null> => {
    const byNew = await Coin.findOne({ symbol: symbol.toUpperCase() });
    if (byNew || config.coinDataReadFromNewCollections) return byNew;
    const db = mongoose.connection.db;
    if (!db) return byNew;
    const legacy = await db.collection('coins').findOne({ symbol: symbol.toUpperCase() });
    return legacy as ICoin | null;
  },

  findBySymbols: async (symbols: string[]): Promise<ICoin[]> => {
    if (symbols.length === 0) return [];
    const upperSymbols = symbols.map(s => s.toUpperCase());
    const byNew = await Coin.find({ symbol: { $in: upperSymbols } }).lean<ICoin[]>();
    if (byNew.length > 0 || config.coinDataReadFromNewCollections) return byNew;
    const db = mongoose.connection.db;
    if (!db) return byNew;
    const legacy = await db.collection('coins').find({ symbol: { $in: upperSymbols } }).toArray();
    return legacy as ICoin[];
  },

  searchByQuery: async (query: string, limit: number = 24): Promise<ICoin[]> => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    
    // Use prefix match on indexed lowercase fields for better performance
    const coins = await Coin.find({
      $or: [
        { symbolLower: { $regex: `^${escapeRegex(q)}` } },
        { nameLower: { $regex: `^${escapeRegex(q)}` } },
      ],
    })
      .sort({ rank: 1 })
      .limit(limit)
      .lean<ICoin[]>();
    if (coins.length > 0 || config.coinDataReadFromNewCollections) return coins;
    const db = mongoose.connection.db;
    if (!db) return coins;
    const legacy = await db
      .collection('coins')
      .find({
        $or: [
          { symbolLower: { $regex: `^${escapeRegex(q)}` } },
          { nameLower: { $regex: `^${escapeRegex(q)}` } },
        ],
      })
      .sort({ rank: 1 })
      .limit(limit)
      .toArray();
    return legacy as ICoin[];
  },

  findNewsByCoinId: async (coinId: string, limit: number = 10): Promise<INews[]> => {
    return News.find({ relatedCoins: coinId })
      .sort({ publishedAt: -1 })
      .limit(limit);
  },
};

