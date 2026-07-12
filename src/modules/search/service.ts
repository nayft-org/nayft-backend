import {
  SearchBoardResult,
  SearchCoinResult,
  SearchNewsResult,
  SearchPortfolioAssetResult,
  SearchUserResult,
  searchRepository,
} from './repository';
import { cacheHelpers } from '../../config/redis';
import { withSegmentTimeout, ActiveSearchSegment, SegmentRunStatus } from './timeout';
import { createHash } from 'crypto';

export type SearchSegment =
  | 'all'
  | 'coins'
  | 'news'
  | 'users'
  | 'newsBoards'
  | 'portfolioAssets';

export interface UnifiedSearchResponse {
  results: {
    coins: SearchCoinResult[];
    news: SearchNewsResult[];
    users: SearchUserResult[];
    newsBoards: SearchBoardResult[];
    portfolioAssets: SearchPortfolioAssetResult[];
  };
  meta: {
    tookMs: number;
    query: string;
    segments: SearchSegment[];
    partialFailures?: string[];
    segmentStatus?: Partial<Record<ActiveSearchSegment, SegmentRunStatus>>;
    segmentTookMs?: Partial<Record<ActiveSearchSegment, number>>;
    cacheHit?: boolean;
    degraded?: boolean;
  };
}

const DEFAULT_SEGMENTS: Exclude<SearchSegment, 'all'>[] = [
  'coins',
  'news',
  'users',
  'newsBoards',
  'portfolioAssets',
];

/** Unified response cache is English-only; per-language strings are applied in searchController via translateUnifiedSearchResponse. */
const CACHE_TTL_SECONDS = 30;
const MAX_QUERY_LEN = 100;
const MIN_QUERY_LEN = 2;
const SEARCH_CACHE_VERSION = 'v1';

const SEGMENT_BUDGET_MS: Record<ActiveSearchSegment, number> = {
  coins: 200,
  news: 250,
  users: 200,
  newsBoards: 150,
  portfolioAssets: 150,
};

/** Parallel segments; JSON merge order matches priority (coins → users → news → …). */
const SEGMENT_ORDER: ActiveSearchSegment[] = [
  'coins',
  'users',
  'news',
  'newsBoards',
  'portfolioAssets',
];

function normalizeQuery(raw: string): string {
  const s = raw
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, MAX_QUERY_LEN);
  return s;
}

function normalizeSegments(rawSegments?: SearchSegment[]): SearchSegment[] {
  if (!rawSegments || rawSegments.length === 0) return ['all'];
  const unique = new Set<SearchSegment>();
  for (const segment of rawSegments) {
    if (!segment) continue;
    if (segment === 'all') return ['all'];
    unique.add(segment);
  }
  return unique.size > 0 ? Array.from(unique) : ['all'];
}

function segmentList(segments: SearchSegment[]): Exclude<SearchSegment, 'all'>[] {
  if (segments.includes('all')) return DEFAULT_SEGMENTS;
  return segments.filter((segment): segment is Exclude<SearchSegment, 'all'> => segment !== 'all');
}

function buildCacheKey(
  query: string,
  segments: SearchSegment[],
  limit: number,
  userId?: string
): string {
  const userKey = userId || 'guest';
  const qHash = queryHash(query);
  return `search:${SEARCH_CACHE_VERSION}:${qHash}|${segments.join(',')}|${limit}|${userKey}`;
}

function queryHash(q: string): string {
  return createHash('sha256').update(q).digest('hex').slice(0, 16);
}

async function readFromCache(cacheKey: string): Promise<UnifiedSearchResponse | null> {
  return cacheHelpers.get<UnifiedSearchResponse>(cacheKey);
}

async function writeToCache(cacheKey: string, value: UnifiedSearchResponse): Promise<void> {
  await cacheHelpers.set(cacheKey, value, CACHE_TTL_SECONDS);
}

export const searchService = {
  async search(params: {
    query: string;
    segments?: SearchSegment[];
    limit?: number;
    userId?: string;
  }): Promise<UnifiedSearchResponse> {
    const startedAt = Date.now();
    const query = normalizeQuery(params.query);
    const segments = normalizeSegments(params.segments);
    const limit = Math.max(1, Math.min(params.limit || 8, 25));
    const activeSegments = segmentList(segments);

    if (!query || query.length < MIN_QUERY_LEN) {
      return {
        results: {
          coins: [],
          news: [],
          users: [],
          newsBoards: [],
          portfolioAssets: [],
        },
        meta: {
          tookMs: Date.now() - startedAt,
          query: query || '',
          segments,
        },
      };
    }

    const cacheKey = buildCacheKey(query, segments, limit, params.userId);
    const cached = await readFromCache(cacheKey);
    if (cached) {
      const res = {
        ...cached,
        meta: {
          ...cached.meta,
          tookMs: Date.now() - startedAt,
          cacheHit: true,
        },
      };
      console.info(
        JSON.stringify({
          event: 'unified_search',
          queryHash: queryHash(query),
          cacheHit: true,
          tookMs: res.meta.tookMs,
          segments: activeSegments,
        })
      );
      return res;
    }

    const runSegment = (seg: ActiveSearchSegment) => {
      if (!activeSegments.includes(seg)) {
        return Promise.resolve({
          segment: seg,
          status: 'ok' as const,
          data: [] as unknown[],
          tookMs: 0,
        });
      }
      let p: Promise<unknown[]>;
      switch (seg) {
        case 'coins':
          p = searchRepository.searchCoins(query, limit);
          break;
        case 'news':
          p = searchRepository.searchNews(query, limit, params.userId);
          break;
        case 'users':
          p = searchRepository.searchUsers(query, limit);
          break;
        case 'newsBoards':
          p = searchRepository.searchNewsBoards(query, limit, params.userId);
          break;
        case 'portfolioAssets':
          p = searchRepository.searchPortfolioAssets(query, limit, params.userId);
          break;
        default:
          p = Promise.resolve([]);
      }
      return withSegmentTimeout(seg, p as Promise<any[]>, SEGMENT_BUDGET_MS[seg]);
    };

    const segmentOutcomes = await Promise.all(SEGMENT_ORDER.map((seg) => runSegment(seg)));

    const segmentStatus: Partial<Record<ActiveSearchSegment, SegmentRunStatus>> = {};
    const segmentTookMs: Partial<Record<ActiveSearchSegment, number>> = {};
    const partialFailures: string[] = [];

    for (const o of segmentOutcomes) {
      if (!activeSegments.includes(o.segment)) continue;
      segmentStatus[o.segment] = o.status;
      segmentTookMs[o.segment] = o.tookMs;
      if (o.status === 'timeout' || o.status === 'error') {
        partialFailures.push(o.segment);
      }
    }

    const coins =
      segmentOutcomes.find((o) => o.segment === 'coins')?.data ?? ([] as SearchCoinResult[]);
    const news =
      segmentOutcomes.find((o) => o.segment === 'news')?.data ?? ([] as SearchNewsResult[]);
    const users =
      segmentOutcomes.find((o) => o.segment === 'users')?.data ?? ([] as SearchUserResult[]);
    const newsBoards =
      segmentOutcomes.find((o) => o.segment === 'newsBoards')?.data ?? ([] as SearchBoardResult[]);
    const portfolioAssets =
      segmentOutcomes.find((o) => o.segment === 'portfolioAssets')?.data ??
      ([] as SearchPortfolioAssetResult[]);

    const degraded = partialFailures.length > 0;

    const response: UnifiedSearchResponse = {
      results: {
        coins: coins as SearchCoinResult[],
        news: news as SearchNewsResult[],
        users: users as SearchUserResult[],
        newsBoards: newsBoards as SearchBoardResult[],
        portfolioAssets: portfolioAssets as SearchPortfolioAssetResult[],
      },
      meta: {
        tookMs: Date.now() - startedAt,
        query,
        segments,
        partialFailures: partialFailures.length > 0 ? partialFailures : undefined,
        segmentStatus: Object.keys(segmentStatus).length > 0 ? segmentStatus : undefined,
        segmentTookMs: Object.keys(segmentTookMs).length > 0 ? segmentTookMs : undefined,
        cacheHit: false,
        degraded: degraded || undefined,
      },
    };

    await writeToCache(cacheKey, response);

    console.info(
      JSON.stringify({
        event: 'unified_search',
        queryHash: queryHash(query),
        cacheHit: false,
        tookMs: response.meta.tookMs,
        segments: activeSegments,
        segmentTookMs: response.meta.segmentTookMs,
        partialFailures: response.meta.partialFailures,
        degraded,
      })
    );

    return response;
  },
};
