import { Coin } from '../coin/model';
import { ICoin } from '../../types';
import { randomUUID } from 'crypto';
import { config } from '../../config/env';
import mongoose from 'mongoose';

export const marketRepository = {
  findById: async (coinId: string): Promise<ICoin | null> => {
    return Coin.findOne({ coinId });
  },

  upsertCoin: async (coinData: {
    internalCoinId?: string;
    coinId: string;
    symbol: string;
    name: string;
    rank: number;
    price: number;
    percentChange24h: number;
  }): Promise<ICoin> => {
    const updated = await Coin.findOneAndUpdate(
      { coinId: coinData.coinId },
      {
        ...coinData,
        internalCoinId: coinData.internalCoinId ?? randomUUID(),
        lastUpdated: new Date(),
        migrationVersion: 'coin-domain-v1',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (config.coinDataDualWriteEnabled) {
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('coins').updateOne(
          { coinId: coinData.coinId },
          {
            $set: {
              coinId: coinData.coinId,
              symbol: coinData.symbol,
              name: coinData.name,
              rank: coinData.rank,
              price: coinData.price,
              percentChange24h: coinData.percentChange24h,
              lastUpdated: new Date(),
            },
          },
          { upsert: true }
        );
      }
    }
    return updated;
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

