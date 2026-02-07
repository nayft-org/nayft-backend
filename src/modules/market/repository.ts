import { Coin } from '../coin/model';
import { ICoin } from '../../types';

export const marketRepository = {
  findById: async (coinId: string): Promise<ICoin | null> => {
    return Coin.findOne({ coinId });
  },

  upsertCoin: async (coinData: {
    coinId: string;
    symbol: string;
    name: string;
    rank: number;
    price: number;
    percentChange24h: number;
  }): Promise<ICoin> => {
    return Coin.findOneAndUpdate(
      { coinId: coinData.coinId },
      { ...coinData, lastUpdated: new Date() },
      { upsert: true, new: true }
    );
  },

  findTopGainers: async (limit: number = 10): Promise<ICoin[]> => {
    return Coin.find()
      .sort({ percentChange24h: -1 })
      .limit(limit);
  },

  findTopLosers: async (limit: number = 10): Promise<ICoin[]> => {
    return Coin.find()
      .sort({ percentChange24h: 1 })
      .limit(limit);
  },

  findTrending: async (limit: number = 20): Promise<ICoin[]> => {
    return Coin.find()
      .sort({ rank: 1 })
      .limit(limit);
  },
};

