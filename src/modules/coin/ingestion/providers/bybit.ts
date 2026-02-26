import axios from 'axios';

const BYBIT_BASE_URL = 'https://api.bybit.com';

export interface BybitInstrument {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  status: string;
  raw: Record<string, unknown>;
}

export interface BybitFetchResult {
  provider: 'bybit';
  provider_timestamp?: Date;
  instruments: BybitInstrument[];
}

export async function fetchBybit(): Promise<BybitFetchResult> {
  const response = await axios.get(`${BYBIT_BASE_URL}/v5/market/instruments-info`, {
    params: { category: 'spot' },
  });
  const data = response.data;

  const list = data?.result?.list ?? [];
  const instruments: BybitInstrument[] = list.map((item: Record<string, unknown>) => ({
    symbol: String(item.symbol ?? ''),
    baseCoin: String(item.baseCoin ?? ''),
    quoteCoin: String(item.quoteCoin ?? ''),
    status: String(item.status ?? ''),
    raw: item,
  }));

  return {
    provider: 'bybit',
    instruments,
  };
}
