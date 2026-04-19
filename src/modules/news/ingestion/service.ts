import { coindeskApi, extractTickers, type CoindeskNewsArticle } from '../../../utils/coindesk';
import { FilteredCoin } from '../../coin/models/FilteredCoin';
import { ingestionRepository } from './repository';
import type { INewsArticle, INewsArticleCategory, INewsArticleCoin } from '../models/NewsArticle';

const SUBTITLE_MAX_LENGTH = 300;
/** Keywords this length or shorter need API ticker corroboration (avoids e.g. ETH in "ETHICS"). */
const SHORT_KEYWORD_MAX_LEN = 3;

export type StoreNewsResult = {
  fetched: number;
  stored: number;
  skipped: number;
  inserted: number;
  updated: number;
};

/** Built from `exchange_listed_assets` distinct base_asset (see storeNews). */
type TrackedCoinLean = { symbol: string; name: string; keywords: string[] };

type CompiledKeyword = {
  coin: TrackedCoinLean;
  regex: RegExp;
  strict: boolean;
};

function normalizeSymbol(symbol: string): string {
  const segment = symbol.split(/[-/]/)[0]?.trim() ?? '';
  return segment.toUpperCase();
}

function mapCategories(categories: string[] | undefined): INewsArticleCategory[] {
  if (!categories || categories.length === 0) return [];
  return categories.map((cat) => ({
    id: cat,
    key: cat.toLowerCase(),
    name: cat,
  }));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Precompile keyword regexes once per ingestion run (see plan: performance).
 * Short keywords (length ≤ SHORT_KEYWORD_MAX_LEN) use strict mode: title match alone is not enough;
 * the same coin must appear in API tickers (corroboration) to reduce false positives.
 *
 * Keywords come from each base_asset lowercased only (unlike curated CoinMaster aliases such as
 * "bitcoin" for BTC), so title-only mentions of full coin names may match less often unless
 * tickers appear in the article payload or the title includes the base ticker token.
 */
function buildCompiledKeywords(trackedCoinList: TrackedCoinLean[]): CompiledKeyword[] {
  const out: CompiledKeyword[] = [];
  for (const coin of trackedCoinList) {
    if (!coin.keywords?.length) continue;
    for (const kw of coin.keywords) {
      const trimmed = kw.trim();
      if (!trimmed) continue;
      out.push({
        coin,
        regex: new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'i'),
        strict: trimmed.length <= SHORT_KEYWORD_MAX_LEN,
      });
    }
  }
  return out;
}

function matchCoinsFromTitle(
  title: string,
  compiled: CompiledKeyword[],
  apiNormSet: Set<string>
): INewsArticleCoin[] {
  const titleLower = title.toLowerCase();
  const seen = new Set<string>();
  const coins: INewsArticleCoin[] = [];

  for (const { coin, regex, strict } of compiled) {
    if (!regex.test(titleLower)) continue;
    const symNorm = normalizeSymbol(coin.symbol);
    if (!symNorm) continue;
    if (strict && !apiNormSet.has(symNorm)) continue;
    if (!seen.has(symNorm)) {
      seen.add(symNorm);
      coins.push({ symbol: symNorm, name: coin.name });
    }
  }

  return coins;
}

function mergeCoins(
  fromKeywords: INewsArticleCoin[],
  fromApiNormalized: string[],
  trackedCoinMap: Map<string, { symbol: string; name: string }>
): INewsArticleCoin[] {
  const seen = new Set<string>();
  const result: INewsArticleCoin[] = [];

  for (const c of fromKeywords) {
    const key = normalizeSymbol(c.symbol);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ symbol: key, name: c.name });
  }

  for (const sym of fromApiNormalized) {
    const key = normalizeSymbol(sym);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const tracked = trackedCoinMap.get(key);
    result.push({
      symbol: key,
      name: tracked?.name ?? key,
    });
  }

  return result;
}

type IngestionArticleContext = {
  trackedCoinMap: Map<string, { symbol: string; name: string }>;
  trackedSymbols: Set<string>;
  compiledKeywords: CompiledKeyword[];
};

function coindeskToNewsArticle(
  article: CoindeskNewsArticle,
  ctx: IngestionArticleContext
): Omit<INewsArticle, 'createdAt' | 'updatedAt'> | null {
  const externalId = article.id;
  const subtitle = article.summary || article.description;
  const truncatedSubtitle = subtitle
    ? subtitle.length > SUBTITLE_MAX_LENGTH
      ? subtitle.slice(0, SUBTITLE_MAX_LENGTH) + '...'
      : subtitle
    : undefined;

  const sourceStr =
    typeof article.source === 'string'
      ? article.source
      : article.source && typeof article.source === 'object'
        ? String(
            (article.source as Record<string, unknown>).name ??
              (article.source as Record<string, unknown>).key ??
              'coindesk'
          )
        : 'coindesk';
  const sourceKey = sourceStr.toLowerCase().replace(/\s+/g, '-');

  const rawTickers = extractTickers(article);
  const apiNormalized = [...new Set(rawTickers.map((t) => normalizeSymbol(t)).filter(Boolean))];
  const apiNormSet = new Set(apiNormalized);

  const fromKeywords = matchCoinsFromTitle(
    article.title || article.headline || '',
    ctx.compiledKeywords,
    apiNormSet
  );
  const coinsMerged = mergeCoins(fromKeywords, apiNormalized, ctx.trackedCoinMap);
  const coins = coinsMerged.filter((c) => ctx.trackedSymbols.has(normalizeSymbol(c.symbol)));

  if (coins.length === 0) return null;

  return {
    externalId,
    guid: externalId,
    title: article.title || article.headline || 'Untitled',
    subtitle: truncatedSubtitle,
    imageUrl: article.imageUrl,
    sourceUrl: article.url,
    publishedAt: new Date(article.publishedAt),
    source: {
      sourceId: externalId,
      key: sourceKey,
      name: sourceStr || 'CoinDesk',
      lang: 'en',
    },
    author: undefined,
    categories: mapCategories(article.categories),
    coins,
    sentiment: 'neutral',
    status: 'active',
    metrics: {
      views: 0,
      likes: 0,
      saves: 0,
      comments: 0,
      reactions: {
        appreciate: 0,
        insightful: 0,
        bullish: 0,
        risk: 0,
        deepDive: 0,
        debatable: 0,
        total: 0,
      },
    },
  };
}

/**
 * Build tracked coin rows from `exchange_listed_assets` (distinct base_asset).
 * Run POST /api/coins/create-collections first so this collection is populated.
 */
function trackedCoinsFromFilteredBaseAssets(baseAssets: string[]): TrackedCoinLean[] {
  const out: TrackedCoinLean[] = [];
  const seen = new Set<string>();
  for (const raw of baseAssets) {
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    const sym = normalizeSymbol(trimmed);
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push({
      symbol: sym,
      name: sym,
      keywords: [trimmed.toLowerCase()],
    });
  }
  return out;
}

export const ingestionService = {
  storeNews: async (): Promise<StoreNewsResult> => {
    const baseAssets = (await FilteredCoin.distinct('base_asset', {
      base_asset: { $exists: true, $nin: [null, ''] },
    })) as string[];

    const trackedCoinList = trackedCoinsFromFilteredBaseAssets(baseAssets);
    const trackedSymbols = new Set(
      trackedCoinList.map((m) => normalizeSymbol(m.symbol)).filter((s): s is string => Boolean(s))
    );

    const trackedCoinMap = new Map<string, { symbol: string; name: string }>();
    for (const c of trackedCoinList) {
      const k = normalizeSymbol(c.symbol);
      if (!k) continue;
      trackedCoinMap.set(k, { symbol: k, name: c.name });
    }

    const withKeywords = trackedCoinList.filter((c) => Array.isArray(c.keywords) && c.keywords.length > 0);
    const compiledKeywords = buildCompiledKeywords(withKeywords);

    let articles: CoindeskNewsArticle[];
    try {
      articles = await coindeskApi.getLatestNews();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      throw new Error(`CoinDesk API error: ${msg || `HTTP ${err.response?.status}`}`);
    }

    const fetched = articles.length;
    if (fetched === 0) {
      return { fetched: 0, stored: 0, skipped: 0, inserted: 0, updated: 0 };
    }

    const ctx: IngestionArticleContext = { trackedCoinMap, trackedSymbols, compiledKeywords };
    const toUpsert: Omit<INewsArticle, 'createdAt' | 'updatedAt'>[] = [];
    for (const a of articles) {
      const doc = coindeskToNewsArticle(a, ctx);
      if (doc) toUpsert.push(doc);
    }

    const stored = toUpsert.length;
    const skipped = fetched - stored;

    const result = await ingestionRepository.upsertMany(toUpsert);

    return {
      fetched,
      stored,
      skipped,
      inserted: result.inserted,
      updated: result.updated,
    };
  },
};
