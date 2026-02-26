import { fetchBinance } from './binance';
import { fetchBybit } from './bybit';
import { fetchOkx } from './okx';
import { fetchCoinbase } from './coinbase';

export type ProviderFetchResult =
  | Awaited<ReturnType<typeof fetchBinance>>
  | Awaited<ReturnType<typeof fetchBybit>>
  | Awaited<ReturnType<typeof fetchOkx>>
  | Awaited<ReturnType<typeof fetchCoinbase>>;

export interface FetchAllResult {
  results: ProviderFetchResult[];
  errors: { provider: string; error: string }[];
}

export async function fetchAllProviders(): Promise<FetchAllResult> {
  const settled = await Promise.allSettled([
    fetchBinance(),
    fetchBybit(),
    fetchOkx(),
    fetchCoinbase(),
  ]);

  const results: ProviderFetchResult[] = [];
  const errors: { provider: string; error: string }[] = [];
  const providerNames = ['binance', 'bybit', 'okx', 'coinbase'];

  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      const errorMsg = result.reason?.message ?? String(result.reason);
      errors.push({ provider: providerNames[i], error: errorMsg });
      console.error(`[ingestion] Provider ${providerNames[i]} failed:`, errorMsg);
    }
  });

  return { results, errors };
}

export { fetchBinance } from './binance';
export { fetchBybit } from './bybit';
export { fetchOkx } from './okx';
export { fetchCoinbase } from './coinbase';
