import { SHORT_TICKER_DENYLIST } from '../../../i18n/coinDictionary';
import type { INewsArticleCoin } from '../models/NewsArticle';

const SHORT_SYMBOL_MAX_LEN = 3;
const AMBIGUOUS_NEWS_SYMBOLS = new Set(['trump', 'time', 'move', 'bull', 'major', 'easy']);

export type CoinTermMatchType = 'symbol' | 'name' | 'keyword';

export type NewsCoinArticleInput = {
  title?: string;
  headline?: string;
  subtitle?: string;
  apiTickers?: string[];
  categories?: string[];
};

export type CoinDerivationDiagnostics = {
  trustedSymbols: string[];
  matchedTerms: Array<{
    symbol: string;
    term: string;
    matchType: CoinTermMatchType;
    corroborated: boolean;
  }>;
};

type CompiledCoinTerm = {
  symbol: string;
  name: string;
  term: string;
  matchType: CoinTermMatchType;
  regex: RegExp;
  ambiguous: boolean;
  requiresCorroboration: boolean;
};

export type NewsCoinDerivationContext = {
  trackedSymbols: Set<string>;
  displayNameBySymbol: Map<string, string>;
  compiledTerms: CompiledCoinTerm[];
};

export type CoinMasterLike = {
  symbol: string;
  name: string;
  keywords?: string[];
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeSymbol(symbol: string): string {
  const segment = String(symbol ?? '')
    .split(/[-/]/)[0]
    ?.trim();
  return (segment ?? '').toUpperCase();
}

function normalizeTextTerm(term: string): string {
  return String(term ?? '').trim().toLowerCase();
}

function isAmbiguousNewsTerm(term: string): boolean {
  const normalized = normalizeTextTerm(term);
  if (!normalized) return true;
  if (AMBIGUOUS_NEWS_SYMBOLS.has(normalized)) return true;
  if (normalized.length <= 5 && SHORT_TICKER_DENYLIST.has(normalized)) return true;
  return false;
}

function shouldKeepTextTerm(term: string): boolean {
  return normalizeTextTerm(term).length >= 2;
}

function buildCompiledTerm(
  symbol: string,
  name: string,
  term: string,
  matchType: CoinTermMatchType
): CompiledCoinTerm | null {
  const trimmed = String(term ?? '').trim();
  if (!shouldKeepTextTerm(trimmed)) return null;

  const ambiguous = isAmbiguousNewsTerm(trimmed);
  const requiresCorroboration =
    ambiguous || (matchType === 'symbol' && normalizeSymbol(symbol).length <= SHORT_SYMBOL_MAX_LEN);

  return {
    symbol: normalizeSymbol(symbol),
    name: name || normalizeSymbol(symbol),
    term: trimmed,
    matchType,
    regex: new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'i'),
    ambiguous,
    requiresCorroboration,
  };
}

export function buildNewsCoinDerivationContext(
  trackedBaseAssets: string[],
  coinMasters: CoinMasterLike[]
): NewsCoinDerivationContext {
  const trackedSymbols = new Set<string>();
  const displayNameBySymbol = new Map<string, string>();

  for (const raw of trackedBaseAssets) {
    const symbol = normalizeSymbol(raw);
    if (!symbol) continue;
    trackedSymbols.add(symbol);
    if (!displayNameBySymbol.has(symbol)) {
      displayNameBySymbol.set(symbol, symbol);
    }
  }

  const mastersBySymbol = new Map<string, CoinMasterLike>();
  for (const master of coinMasters) {
    const symbol = normalizeSymbol(master.symbol);
    if (!symbol || !trackedSymbols.has(symbol)) continue;
    mastersBySymbol.set(symbol, master);
    if (master.name?.trim()) {
      displayNameBySymbol.set(symbol, master.name.trim());
    }
  }

  const compiledTerms: CompiledCoinTerm[] = [];
  const seen = new Set<string>();
  for (const symbol of trackedSymbols) {
    const master = mastersBySymbol.get(symbol);
    const displayName = displayNameBySymbol.get(symbol) || symbol;
    const candidates: Array<{ term: string; matchType: CoinTermMatchType }> = [
      { term: symbol, matchType: 'symbol' },
    ];

    if (master?.name?.trim()) {
      candidates.push({ term: master.name.trim(), matchType: 'name' });
    }
    for (const keyword of master?.keywords || []) {
      if (String(keyword ?? '').trim()) {
        candidates.push({ term: String(keyword).trim(), matchType: 'keyword' });
      }
    }

    for (const candidate of candidates) {
      const key = `${symbol}::${candidate.matchType}::${normalizeTextTerm(candidate.term)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const compiled = buildCompiledTerm(symbol, displayName, candidate.term, candidate.matchType);
      if (compiled) compiledTerms.push(compiled);
    }
  }

  compiledTerms.sort((a, b) => {
    const lenDiff = b.term.length - a.term.length;
    if (lenDiff !== 0) return lenDiff;
    if (a.requiresCorroboration !== b.requiresCorroboration) {
      return a.requiresCorroboration ? 1 : -1;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  return { trackedSymbols, displayNameBySymbol, compiledTerms };
}

function collectTrustedSymbols(
  article: NewsCoinArticleInput,
  trackedSymbols: Set<string>
): Set<string> {
  const trusted = new Set<string>();
  const rawSignals = [...(article.apiTickers || []), ...(article.categories || [])];
  for (const signal of rawSignals) {
    const normalized = normalizeSymbol(signal);
    if (normalized && trackedSymbols.has(normalized)) {
      trusted.add(normalized);
    }
  }
  return trusted;
}

function buildSearchText(article: NewsCoinArticleInput): string {
  return [article.title || article.headline || '', article.subtitle || '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

export function deriveNewsArticleCoins(
  article: NewsCoinArticleInput,
  ctx: NewsCoinDerivationContext
): { coins: INewsArticleCoin[]; diagnostics: CoinDerivationDiagnostics } {
  const trustedSymbols = collectTrustedSymbols(article, ctx.trackedSymbols);
  const matchedTerms: CoinDerivationDiagnostics['matchedTerms'] = [];
  const coins: INewsArticleCoin[] = [];
  const seen = new Set<string>();

  const pushCoin = (symbol: string) => {
    const normalized = normalizeSymbol(symbol);
    if (!normalized || !ctx.trackedSymbols.has(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    coins.push({
      symbol: normalized,
      name: ctx.displayNameBySymbol.get(normalized) || normalized,
    });
  };

  for (const symbol of trustedSymbols) {
    pushCoin(symbol);
  }

  const searchText = buildSearchText(article);
  for (const compiled of ctx.compiledTerms) {
    if (!searchText || !compiled.regex.test(searchText)) continue;
    const corroborated = trustedSymbols.has(compiled.symbol);
    if (compiled.requiresCorroboration && !corroborated) continue;
    matchedTerms.push({
      symbol: compiled.symbol,
      term: compiled.term,
      matchType: compiled.matchType,
      corroborated,
    });
    pushCoin(compiled.symbol);
  }

  return {
    coins,
    diagnostics: {
      trustedSymbols: [...trustedSymbols],
      matchedTerms,
    },
  };
}
