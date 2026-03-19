import axios from 'axios';
import { config } from '../config/env';
import { CoinMarketCapResponse } from '../types';
import { cacheHelpers } from '../config/redis';

const client = axios.create({
  baseURL: config.cmcBaseUrl,
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
    
    // Try cache first
    const cached = await cacheHelpers.get<CoinMarketCapResponse>(cacheKey);
    if (cached) return cached;
    
    // Fetch from API
    const response = await client.get<CoinMarketCapResponse>('/v1/cryptocurrency/trending/gainers-losers');
    
    // Cache the response
    await cacheHelpers.set(cacheKey, response.data, CMC_CACHE_TTL);
    return response.data;
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
    console.log(response);
    
    // Cache the response
    await cacheHelpers.set(cacheKey, response.data, CMC_CACHE_TTL);
    return response.data;
  },
};

