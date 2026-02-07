import axios from 'axios';
import { config } from '../config/env';
import { CoinMarketCapResponse } from '../types';

const client = axios.create({
  baseURL: config.cmcBaseUrl,
  headers: {
    'X-CMC_PRO_API_KEY': config.cmcApiKey,
  },
});

export const coinmarketcapApi = {
  getListingsLatest: async (limit: number = 100, start: number = 1) => {
    const response = await client.get<CoinMarketCapResponse>('/v1/cryptocurrency/listings/latest', {
      params: {
        start,
        limit,
        convert: 'USD',
      },
    });
    return response.data;
  },

  getQuotesLatest: async (symbol: string | string[]) => {
    const symbols = Array.isArray(symbol) ? symbol.join(',') : symbol;
    const response = await client.get<CoinMarketCapResponse>('/v2/cryptocurrency/quotes/latest', {
      params: {
        symbol: symbols.toUpperCase(),
        convert: 'USD',
      },
    });
    return response.data;
  },

  getQuotesLatestById: async (id: string | string[]) => {
    const ids = Array.isArray(id) ? id.join(',') : id;
    const response = await client.get<CoinMarketCapResponse>('/v2/cryptocurrency/quotes/latest', {
      params: {
        id: ids,
        convert: 'USD',
      },
    });
    return response.data;
  },

  getTrendingLatest: async () => {
    const response = await client.get<CoinMarketCapResponse>('/v1/cryptocurrency/trending/latest');
    return response.data;
  },

  getTrendingGainersLosers: async () => {
    const response = await client.get<CoinMarketCapResponse>('/v1/cryptocurrency/trending/gainers-losers');
    return response.data;
  },

  getCryptocurrencyInfo: async (id: string | string[]) => {
    const ids = Array.isArray(id) ? id.join(',') : id;
    const response = await client.get<CoinMarketCapResponse>('/v2/cryptocurrency/info', {
      params: {
        id: `${ids}`,
      },
    });
    console.log(response);
    return response.data;
  },
};

