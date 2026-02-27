import axios from 'axios';

const COINBASE_BASE_URL = 'https://api.exchange.coinbase.com';

export interface CoinbaseInstrument {
  id: string;
  base_currency: string;
  quote_currency: string;
  status: string;
  raw: Record<string, unknown>;
}

export interface CoinbaseFetchResult {
  provider: 'coinbase';
  provider_timestamp?: Date;
  instruments: CoinbaseInstrument[];
}

export async function fetchCoinbase(): Promise<CoinbaseFetchResult> {
  const response = await axios.get(`${COINBASE_BASE_URL}/products`);
  const data = response.data;

  const list = Array.isArray(data) ? data : [];
  const instruments: CoinbaseInstrument[] = list.map((item: Record<string, unknown>) => ({
    id: String(item.id ?? ''),
    base_currency: String(item.base_currency ?? ''),
    quote_currency: String(item.quote_currency ?? ''),
    status: String(item.status ?? ''),
    raw: item,
  }));

  return {
    provider: 'coinbase',
    instruments,
  };
}
