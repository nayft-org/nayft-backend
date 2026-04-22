import { coindeskApi, extractTickers, type CoindeskNewsArticle } from '../../../utils/coindesk';
import { FilteredCoin } from '../../coin/models/FilteredCoin';
import { CoinMaster } from '../models/CoinMaster';
import { ingestionRepository } from './repository';
import type { INewsArticle, INewsArticleCategory } from '../models/NewsArticle';
import { buildNewsCoinDerivationContext, deriveNewsArticleCoins, normalizeSymbol } from './coinDerivation';

const SUBTITLE_MAX_LENGTH = 300;

export type StoreNewsResult = {
  fetched: number;
  stored: number;
  skipped: number;
  inserted: number;
  updated: number;
};

function mapCategories(categories: string[] | undefined): INewsArticleCategory[] {
  if (!categories || categories.length === 0) return [];
  return categories.map((cat) => ({
    id: cat,
    key: cat.toLowerCase(),
    name: cat,
  }));
}

function coindeskToNewsArticle(
  article: CoindeskNewsArticle,
  ctx: ReturnType<typeof buildNewsCoinDerivationContext>
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
  const categorySignals = mapCategories(article.categories).map((category) => category.id || category.key || category.name);
  const { coins } = deriveNewsArticleCoins(
    {
      title: article.title,
      headline: article.headline,
      subtitle: truncatedSubtitle,
      apiTickers: rawTickers,
      categories: categorySignals,
    },
    ctx
  );

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

export const ingestionService = {
  storeNews: async (): Promise<StoreNewsResult> => {
    const baseAssets = (await FilteredCoin.distinct('base_asset', {
      base_asset: { $exists: true, $nin: [null, ''] },
    })) as string[];

    const trackedSymbols = [...new Set(baseAssets.map((asset) => normalizeSymbol(asset)).filter(Boolean))];
    const coinMasters = await CoinMaster.find({ symbol: { $in: trackedSymbols } })
      .select('symbol name keywords')
      .lean<Array<{ symbol: string; name: string; keywords?: string[] }>>();
    const ctx = buildNewsCoinDerivationContext(baseAssets, coinMasters);

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
