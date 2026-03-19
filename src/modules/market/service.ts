import { coinmarketcapApi } from '../../utils/coinmarketcap';
import { marketRepository } from './repository';
import { labeledActiveCoinRepository } from '../coin/labeledActiveCoinRepository';
import { Coin } from '../coin/model';
import { cacheHelpers } from '../../config/redis';

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
            },
            upsert: true,
          },
        }));
        
        await Coin.bulkWrite(bulkOps, { ordered: false });
      }

      // Cache the result
      await cacheHelpers.set(cacheKey, coins, MARKET_CACHE_TTL);
      return coins;
    } catch (error: any) {
      // Fallback to database if API fails
      const dbCoins = await marketRepository.findTrending(20);
      return dbCoins.map((coin) => ({
        coinId: coin.coinId,
        symbol: coin.symbol,
        name: coin.name,
        rank: coin.rank,
        price: coin.price,
        percentChange24h: coin.percentChange24h,
      }));
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
            },
            upsert: true,
          },
        }));
        
        await Coin.bulkWrite(bulkOps, { ordered: false });
      }

      // Cache the result
      await cacheHelpers.set(cacheKey, gainers, MARKET_CACHE_TTL);
      return gainers;
    } catch (error: any) {
      // Fallback to database
      const dbCoins = await marketRepository.findTopGainers(10);
      return dbCoins.map((coin) => ({
        coinId: coin.coinId,
        symbol: coin.symbol,
        name: coin.name,
        rank: coin.rank,
        price: coin.price,
        percentChange24h: coin.percentChange24h,
      }));
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
            },
            upsert: true,
          },
        }));
        
        await Coin.bulkWrite(bulkOps, { ordered: false });
      }

      // Cache the result
      await cacheHelpers.set(cacheKey, losers, MARKET_CACHE_TTL);
      return losers;
    } catch (error: any) {
      // Fallback to database
      const dbCoins = await marketRepository.findTopLosers(10);
      return dbCoins.map((coin) => ({
        coinId: coin.coinId,
        symbol: coin.symbol,
        name: coin.name,
        rank: coin.rank,
        price: coin.price,
        percentChange24h: coin.percentChange24h,
      }));
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

