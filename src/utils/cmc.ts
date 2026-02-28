import axios from 'axios';
import { config } from '../config/env';

export interface CmcQuoteUsd {
  price?: number;
  volume_24h?: number;
  volume_change_24h?: number;
  percent_change_1h?: number;
  percent_change_24h?: number;
  percent_change_7d?: number;
  percent_change_30d?: number;
  percent_change_60d?: number;
  percent_change_90d?: number;
  market_cap?: number;
  market_cap_dominance?: number;
  fully_diluted_market_cap?: number;
  tvl?: number | null;
  last_updated?: string;
}

export interface CmcListingEntry {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  num_market_pairs?: number;
  date_added?: string;
  tags?: string[];
  max_supply?: number | null;
  circulating_supply?: number;
  total_supply?: number | null;
  infinite_supply?: boolean;
  platform?: unknown;
  cmc_rank?: number;
  self_reported_circulating_supply?: number | null;
  self_reported_market_cap?: number | null;
  tvl_ratio?: number | null;
  last_updated?: string;
  quote?: {
    USD?: CmcQuoteUsd;
  };
}

export interface CmcListingsResponse {
  status: {
    timestamp?: string;
    error_code?: number;
    error_message?: string | null;
    total_count?: number;
  };
  data: CmcListingEntry[];
}

export const cmcApi = {
  getListingsLatest: async (
    start: number,
    limit = 100
  ): Promise<{ data: CmcListingEntry[]; total_count: number }> => {
    const url = `${config.cmcBaseUrl}/v1/cryptocurrency/listings/latest`;
    const response = await axios.get<CmcListingsResponse>(url, {
      headers: {
        'X-CMC_PRO_API_KEY': config.cmcApiKey,
      },
      params: {
        start,
        limit,
        convert: 'USD',
      },
    });

    const totalCount = response.data?.status?.total_count ?? 0;
    const data = response.data?.data ?? [];
    return { data, total_count: totalCount };
  },
};
