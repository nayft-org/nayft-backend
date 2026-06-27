import { mapCategoryToNayftBucket } from '../../portfolio-intelligence/engines/taxonomy/mapToNayftBucket';

/** Derive NAYFT bucket tags from article coin symbols (best-effort at ingestion). */
export function deriveNayftCategoriesFromCoins(
  coins: Array<{ symbol: string; name?: string }>
): string[] {
  const buckets = new Set<string>();
  for (const coin of coins) {
    const bucket = mapCategoryToNayftBucket(null, null, coin.symbol);
    if (bucket && bucket !== 'Other') buckets.add(bucket);
  }
  return [...buckets];
}

export function deriveNayftCategoryBps(categories: string[]): Record<string, number> {
  if (categories.length === 0) return {};
  const share = Math.floor(10000 / categories.length);
  const bps: Record<string, number> = {};
  for (const c of categories) bps[c] = share;
  return bps;
}
