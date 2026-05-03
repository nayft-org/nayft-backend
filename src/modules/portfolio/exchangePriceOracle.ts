import { coingeckoApi } from '../../utils/coingecko';

const priceMemo = new Map<string, { price: number; at: number }>();
const MEMO_TTL_MS = 5 * 60 * 1000;

let listMemo: { list: Awaited<ReturnType<typeof coingeckoApi.getCoinsList>>; at: number } | null = null;
const LIST_TTL_MS = 10 * 60 * 1000;

async function resolveCoinGeckoId(symbol: string): Promise<string | null> {
  const sym = symbol.trim().toLowerCase();
  if (!sym) return null;
  const now = Date.now();
  if (!listMemo || now - listMemo.at > LIST_TTL_MS) {
    listMemo = { list: await coingeckoApi.getCoinsList(), at: now };
  }
  const exact = listMemo.list.find((e) => e.symbol.toLowerCase() === sym);
  return exact?.id ?? null;
}

/**
 * Best-effort USD price for an exchange asset symbol (e.g. BTC, USDT).
 */
export async function getUsdPriceForSymbol(symbol: string): Promise<number | null> {
  const key = symbol.toUpperCase();
  if (key === 'USDT' || key === 'USDC' || key === 'DAI' || key === 'BUSD') {
    return 1;
  }
  const now = Date.now();
  const hit = priceMemo.get(key);
  if (hit && now - hit.at < MEMO_TTL_MS) {
    return hit.price;
  }
  try {
    const id = await resolveCoinGeckoId(symbol);
    if (!id) return null;
    const coin = await coingeckoApi.getCoinById(id);
    const usd = coin.market_data?.current_price?.usd;
    if (typeof usd !== 'number' || !Number.isFinite(usd)) return null;
    priceMemo.set(key, { price: usd, at: now });
    return usd;
  } catch {
    return null;
  }
}
