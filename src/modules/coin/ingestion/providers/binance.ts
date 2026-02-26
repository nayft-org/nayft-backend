import axios from 'axios';

const BINANCE_BASE_URL = 'https://api1.binance.com';

export interface BinanceInstrument {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  raw: Record<string, unknown>;
}

export interface BinanceFetchResult {
  provider: 'binance';
  provider_timestamp?: Date;
  instruments: BinanceInstrument[];
}

export async function fetchBinance(): Promise<BinanceFetchResult> {
  const response = await axios.get(`${BINANCE_BASE_URL}/api/v3/exchangeInfo`);
  const data = response.data;

  const providerTimestamp = data.serverTime ? new Date(data.serverTime) : undefined;
  const symbols = data.symbols ?? [];

  const instruments: BinanceInstrument[] = symbols.map((s: Record<string, unknown>) => ({
    symbol: String(s.symbol ?? ''),
    baseAsset: String(s.baseAsset ?? ''),
    quoteAsset: String(s.quoteAsset ?? ''),
    status: String(s.status ?? ''),
    raw: s,
  }));

  return {
    provider: 'binance',
    provider_timestamp: providerTimestamp,
    instruments,
  };
}
