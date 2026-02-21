import { coindeskApi, extractTickers, type CoindeskNewsArticle } from '../../../utils/coindesk';
import { CoinMaster } from '../models';
import { ingestionRepository } from './repository';
import type { INewsArticle, INewsArticleCategory, INewsArticleCoin } from '../models/NewsArticle';

const BATCH_SIZE = 50;
const SUBTITLE_MAX_LENGTH = 300;

function mapCategories(categories: string[] | undefined): INewsArticleCategory[] {
  if (!categories || categories.length === 0) return [];
  return categories.map((cat) => ({
    id: cat,
    key: cat.toLowerCase(),
    name: cat,
  }));
}

function matchCoinsFromTitle(
  title: string,
  coinMasterList: { symbol: string; name: string; keywords: string[] }[]
): INewsArticleCoin[] {
  const titleLower = title.toLowerCase();
  const seen = new Set<string>();
  const coins: INewsArticleCoin[] = [];

  for (const coin of coinMasterList) {
    if (!coin.keywords || coin.keywords.length === 0) continue;
    const matched = coin.keywords.some((kw) => {
      const pattern = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
      return pattern.test(titleLower);
    });
    if (matched && !seen.has(coin.symbol.toUpperCase())) {
      seen.add(coin.symbol.toUpperCase());
      coins.push({ symbol: coin.symbol, name: coin.name });
    }
  }

  return coins;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeCoins(
  fromKeywords: INewsArticleCoin[],
  fromApi: string[],
  coinMasterMap: Map<string, { symbol: string; name: string }>
): INewsArticleCoin[] {
  const seen = new Set<string>();
  const result: INewsArticleCoin[] = [];

  for (const c of fromKeywords) {
    const key = c.symbol.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }

  for (const sym of fromApi) {
    const key = sym.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const master = coinMasterMap.get(key);
    result.push({
      symbol: sym.toUpperCase(),
      name: master?.name ?? sym,
    });
  }

  return result;
}

function coindeskToNewsArticle(
  article: CoindeskNewsArticle,
  coinMasterList: { symbol: string; name: string; keywords: string[] }[],
  coinMasterMap: Map<string, { symbol: string; name: string }>
): Omit<INewsArticle, 'createdAt' | 'updatedAt'> {
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
  const apiTickers = extractTickers(article);
  const fromKeywords = matchCoinsFromTitle(article.title || article.headline || '', coinMasterList);
  const coins = mergeCoins(fromKeywords, apiTickers, coinMasterMap);

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
    metrics: { views: 0, likes: 0, saves: 0 },
  };
}

export const ingestionService = {
  storeNews: async (): Promise<{ fetched: number; inserted: number; updated: number }> => {
    const coinMasterList = await CoinMaster.find({ keywords: { $exists: true, $ne: [] } }).lean();
    const coinMasterMap = new Map<string, { symbol: string; name: string }>();
    for (const c of coinMasterList) {
      coinMasterMap.set(c.symbol.toUpperCase(), { symbol: c.symbol, name: c.name });
    }

    let totalFetched = 0;
    let inserted = 0;
    let updated = 0;
    let page = 1;

    while (true) {
      let articles;
      try {
        articles = await coindeskApi.getLatestNews(page, BATCH_SIZE);
      } catch (err: any) {
        const msg = err.response?.data?.message || err.response?.data?.error || err.message;
        throw new Error(`CoinDesk API error: ${msg || `HTTP ${err.response?.status}`}`);
      }
      if (articles.length === 0) break;

      totalFetched += articles.length;

      const toUpsert = articles.map((a) =>
        coindeskToNewsArticle(a, coinMasterList, coinMasterMap)
      );

      const result = await ingestionRepository.upsertMany(toUpsert);
      inserted += result.inserted;
      updated += result.updated;

      if (articles.length < BATCH_SIZE) break;
      page++;
    }

    return { fetched: totalFetched, inserted, updated };
  },
};
