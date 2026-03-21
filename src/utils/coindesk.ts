import axios from 'axios';
import { config } from '../config/env';

// Basic types for CoinDesk news responses based on official documentation:
// https://developers.coindesk.com/documentation/data-api/news

export interface CoindeskNewsArticle {
  id: string;
  headline?: string;
  title?: string;
  description?: string;
  summary?: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  source?: string;
  tickers?: string[];
  assets?: { symbol?: string }[];
  categories?: string[]; // Normalized from CATEGORY_DATA
}

export interface CoindeskNewsResponse {
  // Some responses use `data`, others (like your log) use `Data`
  data?: any;
  Data?: any;
  meta?: any;
}

const coindeskClient = axios.create({
  baseURL: config.coindeskBaseUrl,
  headers: {
    // CoinDesk Data API typically uses an API key header; include both common patterns
    Authorization: config.coindeskApiKey ? `Bearer ${config.coindeskApiKey}` : undefined,
    'X-CoinDesk-API-Key': config.coindeskApiKey || undefined,
  },
});

export const coindeskApi = {
  /**
   * Fetch latest crypto news from CoinDesk.
   * Per docs, the Latest Articles endpoint is:
   *   GET /news/v1/article/list?lang=EN&limit=…
   * CoinDesk caps `limit` at 100 per request; larger values return HTTP 400.
   */
  getLatestNews: async (limit: number = 100): Promise<CoindeskNewsArticle[]> => {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const response = await coindeskClient.get<CoindeskNewsResponse>('/news/v1/article/list', {
      params: {
        lang: 'EN',
        limit: safeLimit,
      },
    });

    // Handle both `Data` and `data` shapes and normalise each item
    const list: any[] =
      (response.data && (response.data as any).Data) ||
      (response.data && (response.data as any).data) ||
      [];

    return list.map((raw) => normalizeArticle(raw));
  },

  /**
   * Fetch news filtered by tickers/symbols, if supported natively.
   * The Latest Articles endpoint does not accept tickers directly, so we:
   *   1) Fetch a larger batch of latest articles
   *   2) Filter client-side using extracted tickers/assets
   */
  getNewsByTickers: async (
    tickers: string[],
    _page: number = 1,
    limit: number = 50
  ): Promise<CoindeskNewsArticle[]> => {
    if (tickers.length === 0) {
      return [];
    }

    const upperSet = new Set(tickers.map((t) => t.toUpperCase()));

    // Fetch a larger window of latest articles and then filter client-side.
    const batchSize = limit * 3;
    const articles = await coindeskApi.getLatestNews(batchSize);

    const filtered = articles.filter((article) => {
      const articleTickers = extractTickers(article);
      return articleTickers.some((t) => upperSet.has(t.toUpperCase()));
    });

    return filtered.slice(0, limit);
  },

  /**
   * Attempt to fetch a single article by ID.
   * Single Article endpoint lives under /news/v1/article/{id}.
   */
  getArticleById: async (id: string): Promise<CoindeskNewsArticle | null> => {
    try {
      const response = await coindeskClient.get<CoindeskNewsArticle>(`/news/v1/article/${id}`);
      const article = response.data as any;
      if (!article) return null;

      // Normalise into CoindeskNewsArticle
      return normalizeArticle(article);
    } catch {
      return null;
    }
  },
};

export const extractTickers = (article: CoindeskNewsArticle): string[] => {
  const tickers: string[] = [];

  if (Array.isArray(article.tickers)) {
    tickers.push(...article.tickers);
  }

  if (Array.isArray(article.assets)) {
    article.assets.forEach((asset) => {
      if (asset?.symbol) {
        tickers.push(asset.symbol);
      }
    });
  }

  return tickers;
};

export const normalizeArticle = (raw: any): CoindeskNewsArticle => {
  // Normalise CATEGORY_DATA into string categories (e.g. BTC, ETH, MARKET, CRYPTOCURRENCY)
  const categories: string[] = Array.isArray(raw.CATEGORY_DATA)
    ? raw.CATEGORY_DATA.map((c: any) => (c?.CATEGORY || c?.NAME || '').toString().toUpperCase()).filter(
        (c: string) => !!c
      )
    : [];

  return {
    // ID / GUID
    id: String(raw.id ?? raw.ID ?? raw.article_id ?? raw.uuid ?? raw.GUID ?? raw.url ?? raw.URL),
    // Titles
    headline: raw.headline ?? raw.title ?? raw.TITLE,
    title: raw.title ?? raw.headline ?? raw.TITLE,
    // Body / description
    description: raw.description ?? raw.summary ?? raw.BODY,
    summary: raw.summary ?? raw.description ?? raw.BODY,
    // URLs
    url: raw.url ?? raw.URL ?? raw.link ?? raw.GUID,
    imageUrl: raw.image_url ?? raw.IMAGE_URL ?? raw.imageUrl ?? raw.image,
    // Published time (Coindesk vs CryptoCompare-style timestamps)
    publishedAt:
      raw.published_at ??
      raw.publishedAt ??
      (typeof raw.PUBLISHED_ON === 'number'
        ? new Date(raw.PUBLISHED_ON * 1000).toISOString()
        : raw.date ??
          new Date().toISOString()),
    source: raw.source ?? raw.SOURCE_ID ?? 'CoinDesk',
    tickers: raw.tickers ?? raw.symbols ?? [],
    assets: raw.assets,
    categories,
  };
};

