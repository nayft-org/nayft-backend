import { coinmarketcapApi } from '../../utils/coinmarketcap';
import { marketRepository } from './repository';
import { labeledActiveCoinRepository } from '../coin/labeledActiveCoinRepository';

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
    try {
      const cmcResponse = await coinmarketcapApi.getListingsLatest(20);
      const coins = mapCoinMarketCapData(cmcResponse);

      // Update database
      for (const coin of coins) {
        await marketRepository.upsertCoin({
          coinId: coin.coinId,
          symbol: coin.symbol,
          name: coin.name,
          rank: coin.rank,
          price: coin.price,
          percentChange24h: coin.percentChange24h,
        });
      }

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
    try {
      const cmcResponse = await coinmarketcapApi.getTrendingGainersLosers();
      const coins = mapCoinMarketCapData(cmcResponse);

      // Filter and sort by gain
      const gainers = coins
        .filter((coin: any) => coin.percentChange24h > 0)
        .sort((a: any, b: any) => b.percentChange24h - a.percentChange24h)
        .slice(0, 10);

      // Update database
      for (const coin of gainers) {
        await marketRepository.upsertCoin({
          coinId: coin.coinId,
          symbol: coin.symbol,
          name: coin.name,
          rank: coin.rank,
          price: coin.price,
          percentChange24h: coin.percentChange24h,
        });
      }

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
    try {
      const cmcResponse = await coinmarketcapApi.getTrendingGainersLosers();
      const coins = mapCoinMarketCapData(cmcResponse);

      // Filter and sort by loss
      const losers = coins
        .filter((coin: any) => coin.percentChange24h < 0)
        .sort((a: any, b: any) => a.percentChange24h - b.percentChange24h)
        .slice(0, 10);

      // Update database
      for (const coin of losers) {
        await marketRepository.upsertCoin({
          coinId: coin.coinId,
          symbol: coin.symbol,
          name: coin.name,
          rank: coin.rank,
          price: coin.price,
          percentChange24h: coin.percentChange24h,
        });
      }

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

