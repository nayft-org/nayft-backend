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
    }>(`/wallets/${address}/portfolio`, { params: { currency: 'usd' } });

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
   * Zerion returns chain_id in relationships.chain.data.id; name/symbol in attributes.fungible_info.
   */
  getWalletPositions: async (address: string): Promise<ZerionPosition[]> => {
    const response = await client.get<{
      data: Array<{
        attributes: {
          quantity?: { float: number };
          value: number;
          fungible_info?: { name?: string; symbol?: string };
        };
        relationships?: { chain?: { data?: { id: string } } };
      }>;
    }>(`/wallets/${address}/positions/`, {
      params: { sort: 'value', currency: 'usd' },
    });

    const items = response.data?.data ?? [];
    return items.map((item) => {
      const attrs = item.attributes ?? {};
      const fungible = attrs.fungible_info;
      const chainId = item.relationships?.chain?.data?.id ?? '';
      return {
        name:     (fungible?.name ?? '') as string,
        symbol:   (fungible?.symbol ?? '') as string,
        quantity: attrs.quantity?.float ?? 0,
        value:    attrs.value ?? 0,
        chain:    chainId,
      };
    });
  },
};
