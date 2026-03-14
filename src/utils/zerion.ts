import axios from 'axios';
import { config } from '../config/env';

// Zerion uses HTTP Basic auth: API key as username, empty password
function buildAuthHeader(): string {
  const encoded = Buffer.from(`${config.zerionApiKey}:`).toString('base64');
  return `Basic ${encoded}`;
}

const client = axios.create({
  baseURL: config.zerionBaseUrl,
  headers: {
    accept:        'application/json',
    Authorization: buildAuthHeader(),
  },
});

export interface ZerionPortfolioData {
  totalValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
  positions: ZerionPosition[];
}

export interface ZerionPosition {
  name:     string;
  symbol:   string;
  quantity: number;
  value:    number;
  chain:    string;
}

export const zerionApi = {
  /**
   * Fetches high-level portfolio stats for a wallet address (all chains).
   */
  getWalletPortfolio: async (address: string): Promise<ZerionPortfolioData> => {
    const response = await client.get<{
      data: {
        attributes: {
          total:      { positions: number };
          changes:    { absolute_1d: number; percent_1d: number };
          positions_distribution_by_type: Record<string, number>;
        };
      };
    }>(`/wallets/${address}/portfolio`);

    const attrs = response.data?.data?.attributes;
    return {
      totalValue:        attrs?.total?.positions ?? 0,
      absoluteChange24h: attrs?.changes?.absolute_1d ?? 0,
      relativeChange24h: attrs?.changes?.percent_1d ?? 0,
      positions:         [],
    };
  },

  /**
   * Fetches individual token positions for a wallet across all supported chains.
   */
  getWalletPositions: async (address: string): Promise<ZerionPosition[]> => {
    const response = await client.get<{
      data: Array<{
        attributes: {
          name:      string;
          symbol:    string;
          quantity:  { float: number };
          value:     number;
          chain_id:  string;
        };
      }>;
    }>(`/wallets/${address}/positions`, {
      params: { sort: 'value', currency: 'usd' },
    });

    return (response.data?.data ?? []).map((item) => ({
      name:     item.attributes.name,
      symbol:   item.attributes.symbol,
      quantity: item.attributes.quantity?.float ?? 0,
      value:    item.attributes.value ?? 0,
      chain:    item.attributes.chain_id ?? '',
    }));
  },
};
