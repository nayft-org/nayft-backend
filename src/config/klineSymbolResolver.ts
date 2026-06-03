import { redis } from './redis';
import { streamConfig } from './streamConfig';
import { LabeledActiveCoin } from '../modules/coin/models/LabeledActiveCoin';
import { config } from './env';

const REDIS_KEY = 'kline:universe:symbols:v1';
const TOP_N = parseInt(process.env.KLINE_TOP_N || '500', 10);

let cachedSymbols: string[] | null = null;

/**
 * Resolves kline stream symbols: Redis cache (sync script) → env KLINE_SYMBOLS → defaults.
 */
export async function resolveKlineSymbols(): Promise<string[]> {
  if (cachedSymbols) return cachedSymbols;

  try {
    const fromRedis = await redis.get(REDIS_KEY);
    if (fromRedis) {
      const parsed = fromRedis
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (parsed.length > 0) {
        cachedSymbols = parsed;
        return parsed;
      }
    }
  } catch {
    // fall through
  }

  cachedSymbols = [...streamConfig.kline.symbols];
  return cachedSymbols;
}

/** Populate Redis from top-N market cap ranks (run via scripts/sync-kline-top500.ts). */
export async function refreshKlineSymbolsFromMarketCap(limit = TOP_N): Promise<string[]> {
  const coins = await LabeledActiveCoin.find({
    provider: config.coinDataPrimarySnapshotProvider,
    market_cap_rank: { $exists: true, $ne: null },
  })
    .select('symbol')
    .sort({ market_cap_rank: 1 })
    .limit(limit)
    .lean();

  const symbols = coins
    .map((c) => (c.symbol || '').toUpperCase())
    .filter(Boolean);

  if (symbols.length > 0) {
    await redis.set(REDIS_KEY, symbols.join(','));
    cachedSymbols = symbols;
  }
  return symbols;
}

export function clearKlineSymbolCache(): void {
  cachedSymbols = null;
}
