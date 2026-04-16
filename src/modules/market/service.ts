import { coinmarketcapApi } from '../../utils/coinmarketcap';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { marketRepository } from './repository';
import { labeledActiveCoinRepository } from '../coin/labeledActiveCoinRepository';
import { LabeledActiveCoin } from '../coin/models/LabeledActiveCoin';
import { Coin } from '../coin/model';
import { cacheHelpers } from '../../config/redis';
import { config } from '../../config/env';

const MARKET_CACHE_TTL = 120; // 2 minutes

const mapCoinMarketCapData = (cmcData: any): any[] => {
  if (!cmcData?.data) return [];

  if (Array.isArray(cmcData.data)) {
    return cmcData.data.map((item: any) => ({
      coinId: item.id?.toString() || '',
      symbol: item.symbol || '',
      name: item.name || '',
      rank: item.cmc_rank || 0,
      price: item.quote?.USD?.price || 0,
      percentChange24h: item.quote?.USD?.percent_change_24h || 0,
      marketCap: item.quote?.USD?.market_cap || 0,
      volume24h: item.quote?.USD?.volume_24h || 0,
      circulatingSupply: item.circulating_supply || 0,
      totalSupply: item.total_supply || 0,
    }));
  }

  // Handle object format (quotes endpoint)
  const dataArray = Object.values(cmcData.data);
  return dataArray.map((item: any) => ({
    coinId: item.id?.toString() || '',
    symbol: item.symbol || '',
    name: item.name || '',
    rank: item.cmc_rank || 0,
    price: item.quote?.USD?.price || 0,
    percentChange24h: item.quote?.USD?.percent_change_24h || 0,
    marketCap: item.quote?.USD?.market_cap || 0,
    volume24h: item.quote?.USD?.volume_24h || 0,
    circulatingSupply: item.circulating_supply || 0,
    totalSupply: item.total_supply || 0,
  }));
};

/** Enrich a list of coins with image URLs from coin_market_snapshots, keyed by symbol.
 *  coin_market_snapshots stores symbols in lowercase (CoinGecko convention), so we
 *  normalise both sides to lowercase for a fast $in index hit.
 */
async function attachImages<T extends { symbol: string }>(coins: T[]): Promise<(T & { image?: string })[]> {
  if (coins.length === 0) return coins;
  const lowerSymbols = coins.map((c) => c.symbol.toLowerCase());
  const docs = await LabeledActiveCoin.find(
    {
      provider: config.coinDataPrimarySnapshotProvider,
      symbol: { $in: lowerSymbols },
    },
    { symbol: 1, image: 1, _id: 0 }
  ).lean().exec() as { symbol: string; image?: string }[];

  const imageMap = new Map<string, string>();
  for (const doc of docs) {
    if (doc.image) imageMap.set(doc.symbol.toLowerCase(), doc.image);
  }

  return coins.map((c) => ({ ...c, image: imageMap.get(c.symbol.toLowerCase()) }));
}

async function attachInternalCoinIds<T extends { coinId: string }>(
  coins: T[]
): Promise<(T & { internalCoinId?: string })[]> {
  if (coins.length === 0) return coins;
  const uniqueCoinIds = [...new Set(coins.map((coin) => String(coin.coinId).trim()).filter(Boolean))];
  if (uniqueCoinIds.length === 0) return coins;
  const docs = await Coin.find({ coinId: { $in: uniqueCoinIds } })
    .select('coinId internalCoinId')
    .lean()
    .exec();
  const map = new Map<string, string>();
  for (const doc of docs as Array<{ coinId: string; internalCoinId?: string }>) {
    if (doc.internalCoinId) {
      map.set(doc.coinId, doc.internalCoinId);
    }
  }
  return coins.map((coin) => ({
    ...coin,
    internalCoinId: (coin as { internalCoinId?: string }).internalCoinId ?? map.get(coin.coinId),
  }));
}

export const marketService = {
  getTrending: async () => {
    const cacheKey = 'market:trending';
    
    // Try cache first
    const cached = await cacheHelpers.get<any[]>(cacheKey);
    if (cached) return cached;
    
    try {
      const cmcResponse = await coinmarketcapApi.getListingsLatest(20);
      const coins = mapCoinMarketCapData(cmcResponse);

      // Batch update database using bulkWrite
      if (coins.length > 0) {
        const bulkOps = coins.map((coin) => ({
          updateOne: {
            filter: { coinId: coin.coinId },
            update: {
              $set: {
                coinId: coin.coinId,
                symbol: coin.symbol,
                name: coin.name,
                rank: coin.rank,
                price: coin.price,
                percentChange24h: coin.percentChange24h,
                lastUpdated: new Date(),
                symbolLower: coin.symbol.toLowerCase(),
                nameLower: coin.name.toLowerCase(),
              },
              $setOnInsert: {
                internalCoinId: randomUUID(),
                migratedAt: new Date(),
                migrationVersion: 'coin-domain-v1',
              },
            },
            upsert: true,
          },
        }));
        
        await Coin.bulkWrite(bulkOps, { ordered: false });
        if (config.coinDataDualWriteEnabled) {
          const db = mongoose.connection.db;
          if (db) {
            const legacyOps = coins.map((coin) => ({
              updateOne: {
                filter: { coinId: coin.coinId },
                update: {
                  $set: {
                    coinId: coin.coinId,
                    symbol: coin.symbol,
                    name: coin.name,
                    rank: coin.rank,
                    price: coin.price,
                    percentChange24h: coin.percentChange24h,
                    lastUpdated: new Date(),
                    symbolLower: coin.symbol.toLowerCase(),
                    nameLower: coin.name.toLowerCase(),
                  },
                },
                upsert: true,
              },
            }));
            await db.collection('coins').bulkWrite(legacyOps as any, { ordered: false });
          }
        }
      }

      const withInternalIds = await attachInternalCoinIds(coins);
      const enriched = await attachImages(withInternalIds);
      await cacheHelpers.set(cacheKey, enriched, MARKET_CACHE_TTL);
      return enriched;
    } catch (error: any) {
      // Fallback to database if API fails
      const dbCoins = await marketRepository.findTrending(20);
      const mapped = dbCoins.map((coin) => ({
        internalCoinId: coin.internalCoinId,
        coinId: coin.coinId,
        symbol: coin.symbol,
        name: coin.name,
        rank: coin.rank,
        price: coin.price,
        percentChange24h: coin.percentChange24h,
      }));
      const withInternalIds = await attachInternalCoinIds(mapped);
      return attachImages(withInternalIds);
    }
  },

  getTopGainers: async () => {
    const cacheKey = 'market:top-gainers';
    
    // Try cache first
    const cached = await cacheHelpers.get<any[]>(cacheKey);
    if (cached) return cached;
    
    try {
      const cmcResponse = await coinmarketcapApi.getTrendingGainersLosers();
      const coins = mapCoinMarketCapData(cmcResponse);

      // Filter and sort by gain
      const gainers = coins
        .filter((coin: any) => coin.percentChange24h > 0)
        .sort((a: any, b: any) => b.percentChange24h - a.percentChange24h)
        .slice(0, 10);

      // Batch update database using bulkWrite
      if (gainers.length > 0) {
        const bulkOps = gainers.map((coin) => ({
          updateOne: {
            filter: { coinId: coin.coinId },
            update: {
              $set: {
                coinId: coin.coinId,
                symbol: coin.symbol,
                name: coin.name,
                rank: coin.rank,
                price: coin.price,
                percentChange24h: coin.percentChange24h,
                lastUpdated: new Date(),
                symbolLower: coin.symbol.toLowerCase(),
                nameLower: coin.name.toLowerCase(),
              },
              $setOnInsert: {
                internalCoinId: randomUUID(),
                migratedAt: new Date(),
                migrationVersion: 'coin-domain-v1',
              },
            },
            upsert: true,
          },
        }));
        
        await Coin.bulkWrite(bulkOps, { ordered: false });
        if (config.coinDataDualWriteEnabled) {
          const db = mongoose.connection.db;
          if (db) {
            const legacyOps = gainers.map((coin) => ({
              updateOne: {
                filter: { coinId: coin.coinId },
                update: {
                  $set: {
                    coinId: coin.coinId,
                    symbol: coin.symbol,
                    name: coin.name,
                    rank: coin.rank,
                    price: coin.price,
                    percentChange24h: coin.percentChange24h,
                    lastUpdated: new Date(),
                    symbolLower: coin.symbol.toLowerCase(),
                    nameLower: coin.name.toLowerCase(),
                  },
                },
                upsert: true,
              },
            }));
            await db.collection('coins').bulkWrite(legacyOps as any, { ordered: false });
          }
        }
      }

      const withInternalIds = await attachInternalCoinIds(gainers);
      const enriched = await attachImages(withInternalIds);
      await cacheHelpers.set(cacheKey, enriched, MARKET_CACHE_TTL);
      return enriched;
    } catch (error: any) {
      // Fallback to database
      const dbCoins = await marketRepository.findTopGainers(10);
      const mapped = dbCoins.map((coin) => ({
        internalCoinId: coin.internalCoinId,
        coinId: coin.coinId,
        symbol: coin.symbol,
        name: coin.name,
        rank: coin.rank,
        price: coin.price,
        percentChange24h: coin.percentChange24h,
      }));
      const withInternalIds = await attachInternalCoinIds(mapped);
      return attachImages(withInternalIds);
    }
  },

  getTopLosers: async () => {
    const cacheKey = 'market:top-losers';
    
    // Try cache first
    const cached = await cacheHelpers.get<any[]>(cacheKey);
    if (cached) return cached;
    
    try {
      const cmcResponse = await coinmarketcapApi.getTrendingGainersLosers();
      const coins = mapCoinMarketCapData(cmcResponse);

      // Filter and sort by loss
      const losers = coins
        .filter((coin: any) => coin.percentChange24h < 0)
        .sort((a: any, b: any) => a.percentChange24h - b.percentChange24h)
        .slice(0, 10);

      // Batch update database using bulkWrite
      if (losers.length > 0) {
        const bulkOps = losers.map((coin) => ({
          updateOne: {
            filter: { coinId: coin.coinId },
            update: {
              $set: {
                coinId: coin.coinId,
                symbol: coin.symbol,
                name: coin.name,
                rank: coin.rank,
                price: coin.price,
                percentChange24h: coin.percentChange24h,
                lastUpdated: new Date(),
                symbolLower: coin.symbol.toLowerCase(),
                nameLower: coin.name.toLowerCase(),
              },
              $setOnInsert: {
                internalCoinId: randomUUID(),
                migratedAt: new Date(),
                migrationVersion: 'coin-domain-v1',
              },
            },
            upsert: true,
          },
        }));
        
        await Coin.bulkWrite(bulkOps, { ordered: false });
        if (config.coinDataDualWriteEnabled) {
          const db = mongoose.connection.db;
          if (db) {
            const legacyOps = losers.map((coin) => ({
              updateOne: {
                filter: { coinId: coin.coinId },
                update: {
                  $set: {
                    coinId: coin.coinId,
                    symbol: coin.symbol,
                    name: coin.name,
                    rank: coin.rank,
                    price: coin.price,
                    percentChange24h: coin.percentChange24h,
                    lastUpdated: new Date(),
                    symbolLower: coin.symbol.toLowerCase(),
                    nameLower: coin.name.toLowerCase(),
                  },
                },
                upsert: true,
              },
            }));
            await db.collection('coins').bulkWrite(legacyOps as any, { ordered: false });
          }
        }
      }

      const withInternalIds = await attachInternalCoinIds(losers);
      const enriched = await attachImages(withInternalIds);
      await cacheHelpers.set(cacheKey, enriched, MARKET_CACHE_TTL);
      return enriched;
    } catch (error: any) {
      // Fallback to database
      const dbCoins = await marketRepository.findTopLosers(10);
      const mapped = dbCoins.map((coin) => ({
        internalCoinId: coin.internalCoinId,
        coinId: coin.coinId,
        symbol: coin.symbol,
        name: coin.name,
        rank: coin.rank,
        price: coin.price,
        percentChange24h: coin.percentChange24h,
      }));
      const withInternalIds = await attachInternalCoinIds(mapped);
      return attachImages(withInternalIds);
    }
  },

  getActiveCoinsPage: async (cursor?: number, limit: number = 20) => {
    const clampedLimit = Math.min(Math.max(limit, 1), 50);
    const { coins, nextCursor } = await labeledActiveCoinRepository.findPage({
      limit: clampedLimit,
      cursor,
    });
    return {
      coins: coins.map((c) => ({
        internalCoinId: (c as any).internalCoinId,
        coinId: c.id,
        symbol: c.symbol,
        name: c.name,
        rank: c.market_cap_rank ?? 0,
        price: c.current_price ?? 0,
        percentChange24h: c.price_change_percentage_24h ?? 0,
        marketCap: c.market_cap,
        volume24h: c.total_volume,
        image: c.image,
      })),
      nextCursor,
    };
  },
};

