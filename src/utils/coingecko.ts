import axios from 'axios';
import { config } from '../config/env';

export interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  image?: {
    thumb?: string;
    small?: string;
    large?: string;
  };
  market_data?: {
    current_price?: { usd?: number };
    price_change_percentage_24h?: number;
    market_cap?: { usd?: number };
    total_volume?: { usd?: number };
  };
  market_cap_rank?: number;
}

export interface CoinGeckoListEntry {
  id: string;
  symbol: string;
  name: string;
}

export interface CoinGeckoMarketEntry {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  fully_diluted_valuation?: number;
  total_volume?: number;
  high_24h?: number;
  low_24h?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
  market_cap_change_24h?: number;
  market_cap_change_percentage_24h?: number;
  circulating_supply?: number;
  total_supply?: number | null;
  max_supply?: number | null;
  ath?: number;
  ath_change_percentage?: number;
  ath_date?: string;
  atl?: number;
  atl_change_percentage?: number;
  atl_date?: string;
  roi?: unknown;
  last_updated?: string;
}

function getHeaders(): Record<string, string> {
  const apiKey = config.coinGeckoApiKey;
  if (!apiKey) return {};
  const headerName =
    config.coinGeckoApiType === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';
  return { [headerName]: apiKey };
}

let coinsListCache: CoinGeckoListEntry[] | null = null;
let coinsListCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const coingeckoApi = {
  getCoinById: async (id: string): Promise<CoinGeckoCoin> => {
    const url = `${config.coinGeckoBaseUrl}/coins/${id}`;
    const response = await axios.get<CoinGeckoCoin>(url, {
      headers: getHeaders(),
    });
    return response.data;
  },

  getCoinsList: async (): Promise<CoinGeckoListEntry[]> => {
    const now = Date.now();
    if (coinsListCache && now - coinsListCacheTime < CACHE_TTL_MS) {
      return coinsListCache;
    }
    const url = `${config.coinGeckoBaseUrl}/coins/list`;
    const response = await axios.get<CoinGeckoListEntry[]>(url, {
      headers: getHeaders(),
      params: { include_platform: false },
    });
    coinsListCache = response.data || [];
    coinsListCacheTime = now;
    return coinsListCache;
  },

  getCoinsMarkets: async (page: number): Promise<CoinGeckoMarketEntry[]> => {
    const url = `${config.coinGeckoBaseUrl}/coins/markets`;
    const response = await axios.get<CoinGeckoMarketEntry[]>(url, {
      headers: getHeaders(),
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 250,
        page,
      },
    });
    return response.data || [];
  },
};
