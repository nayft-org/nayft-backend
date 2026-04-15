import axios from 'axios';
import { config } from '../config/env';
import { CoinMarketCapResponse } from '../types';
import { cacheHelpers } from '../config/redis';

const client = axios.create({
  baseURL: config.cmcBaseUrl,
  timeout: 15_000,
  headers: {
    'X-CMC_PRO_API_KEY': config.cmcApiKey,
  },
});

const CMC_CACHE_TTL = 60; // 60 seconds

export const coinmarketcapApi = {
  getListingsLatest: async (limit: number = 100, start: number = 1) => {
    const cacheKey = `cmc:listings:${limit}:${start}`;
    
    // Try cache first
    const cached = await cacheHelpers.get<CoinMarketCapResponse>(cacheKey);
    if (cached) return cached;
    
    // Fetch from API
    const response = await client.get<CoinMarketCapResponse>('/v1/cryptocurrency/listings/latest', {
      params: {
        start,
        limit,
        convert: 'USD',
      },
    });
    
    // Cache the response
    await cacheHelpers.set(cacheKey, response.data, CMC_CACHE_TTL);
    return response.data;
  },

  getQuotesLatest: async (symbol: string | string[]) => {
    const symbols = Array.isArray(symbol) ? symbol.join(',') : symbol;
    const cacheKey = `cmc:quotes:symbol:${symbols}`;
    
    // Try cache first
    const cached = await cacheHelpers.get<CoinMarketCapResponse>(cacheKey);
    if (cached) return cached;
    
    // Fetch from API
    const response = await client.get<CoinMarketCapResponse>('/v2/cryptocurrency/quotes/latest', {
      params: {
        symbol: symbols.toUpperCase(),
        convert: 'USD',
      },
    });
    
    // Cache the response
    await cacheHelpers.set(cacheKey, response.data, CMC_CACHE_TTL);
    return response.data;
  },

  getQuotesLatestById: async (id: string | string[]) => {
    const ids = Array.isArray(id) ? id.join(',') : id;
    const cacheKey = `cmc:quotes:id:${ids}`;
    
    // Try cache first
    const cached = await cacheHelpers.get<CoinMarketCapResponse>(cacheKey);
    if (cached) return cached;
    
    // Fetch from API
    const response = await client.get<CoinMarketCapResponse>('/v2/cryptocurrency/quotes/latest', {
      params: {
        id: ids,
        convert: 'USD',
      },
    });
    
    // Cache the response
    await cacheHelpers.set(cacheKey, response.data, CMC_CACHE_TTL);
    return response.data;
  },

  getTrendingLatest: async () => {
    const cacheKey = 'cmc:trending:latest';
    
    // Try cache first
    const cached = await cacheHelpers.get<CoinMarketCapResponse>(cacheKey);
    if (cached) return cached;
    
    // Fetch from API
    const response = await client.get<CoinMarketCapResponse>('/v1/cryptocurrency/trending/latest');
    
    // Cache the response
    await cacheHelpers.set(cacheKey, response.data, CMC_CACHE_TTL);
    return response.data;
  },

  getTrendingGainersLosers: async () => {
    const cacheKey = 'cmc:trending:gainers-losers';

    const cached = await cacheHelpers.get<CoinMarketCapResponse>(cacheKey);
    if (cached) return cached;

    try {
      const response = await client.get<CoinMarketCapResponse>(
        '/v1/cryptocurrency/trending/gainers-losers'
      );
      await cacheHelpers.set(cacheKey, response.data, CMC_CACHE_TTL);
      return response.data;
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      /** Hobby / Starter plans often omit this endpoint (403); listings/latest is more widely allowed. */
      if (status === 403 || status === 401) {
        const listings = await coinmarketcapApi.getListingsLatest(100, 1);
        await cacheHelpers.set(cacheKey, listings, CMC_CACHE_TTL);
        return listings;
      }
      throw e;
    }
  },

  getCryptocurrencyInfo: async (id: string | string[]) => {
    const ids = Array.isArray(id) ? id.join(',') : id;
    const cacheKey = `cmc:info:${ids}`;
    
    // Try cache first
    const cached = await cacheHelpers.get<CoinMarketCapResponse>(cacheKey);
    if (cached) return cached;
    
    // Fetch from API
    const response = await client.get<CoinMarketCapResponse>('/v2/cryptocurrency/info', {
      params: {
        id: `${ids}`,
      },
    });

    // Cache the response
    await cacheHelpers.set(cacheKey, response.data, CMC_CACHE_TTL);
    return response.data;
  },
};

