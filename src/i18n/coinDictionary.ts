import { FilteredCoin } from '../modules/coin/models/FilteredCoin';
import { CoinMaster } from '../modules/news/models/CoinMaster';

/** Common English words that collide with short tickers — skip masking (prefer false negative). */
export const SHORT_TICKER_DENYLIST = new Set(
  [
    'one',
    'two',
    'sun',
    'gas',
    'hot',
    'low',
    'can',
    'may',
    'now',
    'why',
    'how',
    'new',
    'all',
    'any',
    'end',
    'day',
    'way',
    'win',
    'pay',
    'tax',
    'fee',
    'run',
    'try',
    'let',
    'key',
    'red',
    'big',
    'bad',
    'yes',
    'not',
    'add',
    'max',
    'min',
    'sum',
    'odd',
    'old',
    'top',
    'pro',
    'pre',
    'per',
    'via',
    'api',
    'nft',
    'dao',
    'web',
    'near',
    'flow',
    'celo',
    'omg',
    'has',
    'had',
    'was',
    'its',
    'our',
    'out',
    'off',
  ].map((s) => s.toLowerCase())
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let dictVersion = 0;
let maskTermsSorted: string[] = [];
let refreshInterval: ReturnType<typeof setInterval> | null = null;

function shouldSkipTerm(term: string): boolean {
  const t = term.trim();
  if (t.length < 2) return true;
  const lower = t.toLowerCase();
  if (t.length <= 5 && SHORT_TICKER_DENYLIST.has(lower)) return true;
  return false;
}

/**
 * Loads FilteredCoin + CoinMaster into an in-memory longest-first mask list.
 * Increments dictVersion so translation Redis keys naturally align with new masking.
 */
export async function refreshCoinDictionary(): Promise<void> {
  const [baseAssets, symbols, masters] = await Promise.all([
    FilteredCoin.distinct('base_asset', {
      base_asset: { $exists: true, $nin: [null, ''] },
    }) as Promise<string[]>,
    FilteredCoin.distinct('symbol', {
      symbol: { $exists: true, $nin: [null, ''] },
    }) as Promise<string[]>,
    CoinMaster.find({}).select('symbol name keywords').lean<
      Array<{ symbol: string; name: string; keywords?: string[] }>
    >(),
  ]);

  const uniq = new Set<string>();
  for (const raw of baseAssets) {
    const s = String(raw).trim();
    if (s) uniq.add(s);
  }
  for (const raw of symbols) {
    const s = String(raw).trim();
    if (s) uniq.add(s);
  }
  for (const m of masters) {
    if (m.symbol) uniq.add(String(m.symbol).trim());
    if (m.name) uniq.add(String(m.name).trim());
    for (const k of m.keywords || []) {
      if (k) uniq.add(String(k).trim());
    }
  }

  const filtered = [...uniq].filter((t) => !shouldSkipTerm(t));
  filtered.sort((a, b) => b.length - a.length);
  maskTermsSorted = filtered;
  dictVersion += 1;
}

export function getDictVersion(): number {
  return dictVersion;
}

export function getMaskTermsSorted(): string[] {
  return maskTermsSorted;
}

/** Start periodic refresh (default 10 minutes). Idempotent. */
export function startCoinDictionaryRefresh(intervalMs: number = 600_000): void {
  if (refreshInterval) return;
  refreshInterval = setInterval(() => {
    refreshCoinDictionary().catch((err) => console.error('[CoinDictionary] refresh failed', err));
  }, intervalMs);
}

export function maskCoinTerms(text: string, placeholder: (i: number) => string): { masked: string; originals: string[] } {
  let result = text;
  const originals: string[] = [];
  let i = 0;
  for (const term of maskTermsSorted) {
    if (term.length < 2) continue;
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
    result = result.replace(re, (match) => {
      originals.push(match);
      return placeholder(i++);
    });
  }
  return { masked: result, originals };
}

export function unmaskCoinTerms(masked: string, originals: string[], placeholder: (i: number) => string): string {
  let out = masked;
  for (let idx = 0; idx < originals.length; idx++) {
    out = out.split(placeholder(idx)).join(originals[idx]);
  }
  return out;
}
