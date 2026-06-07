import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Response } from 'express';
import type { AuthRequest } from '../../types';
import type { SupportedLanguage } from '../user/supportedLanguages';
import { cacheHelpers } from '../../config/redis';
import { withResponseCache } from '../../utils/responseCache';
import { translateNewsArticleDtos, type TranslatableNewsArticle } from '../../i18n/translateNews';
import { getNewsFeedRevision } from './newsFeedRevision';
import { recordNewsTiming } from './newsPerf';

const RESPONSE_TTL_SEC = 120;
const ENTITY_TTL_SEC = 120;

type CachedNewsPayload = { news: TranslatableNewsArticle[] };

function normalizeIfNoneMatch(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  const weak = t.match(/^W\/"(.+)"$/);
  if (weak) return weak[1];
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

export function buildNewsFeedEtag(revision: number, entityCacheKey: string, lang: string): string {
  const digest = createHash('sha1')
    .update(`${revision}:${entityCacheKey}:${lang}`)
    .digest('hex')
    .slice(0, 16);
  return `"${revision}-${digest}"`;
}

function buildResponseCacheKey(revision: number, entityCacheKey: string, lang: string): string {
  return `news:resp:v2:${revision}:${entityCacheKey}:${lang}`;
}

function sendNewsJson(res: Response, news: unknown[], etag: string): void {
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.status(200).type('json').send(
    JSON.stringify({
      success: true,
      data: { news },
      error: null,
    })
  );
}

/**
 * Serves list/following feeds with revision-based early 304 and language-aware response cache.
 */
export async function serveNewsFeedResponse<T extends TranslatableNewsArticle>(options: {
  req: AuthRequest;
  res: Response;
  entityCacheKey: string;
  metricsKind: string;
  lang: SupportedLanguage;
  fetcher: () => Promise<T[]>;
  started: number;
}): Promise<void> {
  const { req, res, entityCacheKey, metricsKind, lang, fetcher, started } = options;

  const revision = await getNewsFeedRevision();
  const etag = buildNewsFeedEtag(revision, entityCacheKey, lang);
  const responseKey = buildResponseCacheKey(revision, entityCacheKey, lang);

  const clientTag = normalizeIfNoneMatch(String(req.headers['if-none-match'] ?? ''));
  const serverTag = normalizeIfNoneMatch(etag);
  if (clientTag && serverTag && clientTag === serverTag) {
    res.setHeader('ETag', etag);
    res.status(304).end();
    recordNewsTiming({
      cacheLookupMs: 0,
      fetcherMs: 0,
      translationMs: 0,
      serializeMs: 0,
      totalMs: Math.round(performance.now() - started),
      cacheHit: true,
      statusCode: 304,
      language: lang,
      articleCount: 0,
    });
    return;
  }

  const cacheLookupStart = performance.now();
  try {
    const cached = await cacheHelpers.get<CachedNewsPayload>(responseKey);
    if (cached?.news) {
      const cacheLookupMs = performance.now() - cacheLookupStart;
      sendNewsJson(res, cached.news, etag);
      recordNewsTiming({
        cacheLookupMs: Math.round(cacheLookupMs),
        fetcherMs: 0,
        translationMs: 0,
        serializeMs: 0,
        totalMs: Math.round(performance.now() - started),
        cacheHit: true,
        statusCode: 200,
        language: lang,
        articleCount: cached.news.length,
      });
      return;
    }
  } catch {
    // compute below
  }

  const cacheLookupMs = performance.now() - cacheLookupStart;
  const fetcherStart = performance.now();
  const { data: newsEn, cacheHit: entityHit } = await withResponseCache({
    cacheKey: entityCacheKey,
    ttlSeconds: ENTITY_TTL_SEC,
    metricsKind,
    fetcher,
  });
  const fetcherMs = performance.now() - fetcherStart;

  const translateStart = performance.now();
  const news = await translateNewsArticleDtos(newsEn, lang);
  const translationMs = performance.now() - translateStart;

  try {
    await cacheHelpers.set(responseKey, { news }, RESPONSE_TTL_SEC);
  } catch {
    /* ignore */
  }

  sendNewsJson(res, news, etag);
  recordNewsTiming({
    cacheLookupMs: Math.round(cacheLookupMs),
    fetcherMs: Math.round(fetcherMs),
    translationMs: Math.round(translationMs),
    serializeMs: 0,
    totalMs: Math.round(performance.now() - started),
    cacheHit: entityHit,
    statusCode: 200,
    language: lang,
    articleCount: news.length,
  });
}
