import {
  SearchBoardResult,
  SearchCoinResult,
  SearchNewsResult,
  SearchPortfolioAssetResult,
  SearchUserResult,
  searchRepository,
} from './repository';
import { cacheHelpers } from '../../config/redis';

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
    nextCursor?: string;
  };
}

const DEFAULT_SEGMENTS: Exclude<SearchSegment, 'all'>[] = [
  'coins',
  'news',
  'users',
  'newsBoards',
  'portfolioAssets',
];

const CACHE_TTL_SECONDS = 30;

const normalizeQuery = (query: string): string => query.trim().replace(/\s+/g, ' ').toLowerCase();

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
  return `search:${query}|${segments.join(',')}|${limit}|${userKey}`;
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
    cursor?: string;
    userId?: string;
  }): Promise<UnifiedSearchResponse> {
    const startedAt = Date.now();
    const query = normalizeQuery(params.query);
    const segments = normalizeSegments(params.segments);
    const limit = Math.max(1, Math.min(params.limit || 8, 25));
    const activeSegments = segmentList(segments);

    if (!query) {
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
          query: '',
          segments,
          nextCursor: params.cursor,
        },
      };
    }

    const cacheKey = buildCacheKey(query, segments, limit, params.userId);
    const cached = await readFromCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        meta: {
          ...cached.meta,
          tookMs: Date.now() - startedAt,
        },
      };
    }

    const tasks: Record<Exclude<SearchSegment, 'all'>, Promise<any>> = {
      coins: activeSegments.includes('coins')
        ? searchRepository.searchCoins(query, limit)
        : Promise.resolve([]),
      news: activeSegments.includes('news')
        ? searchRepository.searchNews(query, limit, params.userId)
        : Promise.resolve([]),
      users: activeSegments.includes('users')
        ? searchRepository.searchUsers(query, limit)
        : Promise.resolve([]),
      newsBoards: activeSegments.includes('newsBoards')
        ? searchRepository.searchNewsBoards(query, limit, params.userId)
        : Promise.resolve([]),
      portfolioAssets: activeSegments.includes('portfolioAssets')
        ? searchRepository.searchPortfolioAssets(query, limit, params.userId)
        : Promise.resolve([]),
    };

    const [coinsRow, newsRow, usersRow, boardsRow, assetsRow] = await Promise.allSettled([
      tasks.coins,
      tasks.news,
      tasks.users,
      tasks.newsBoards,
      tasks.portfolioAssets,
    ]);

    const partialFailures: string[] = [];
    if (coinsRow.status === 'rejected') partialFailures.push('coins');
    if (newsRow.status === 'rejected') partialFailures.push('news');
    if (usersRow.status === 'rejected') partialFailures.push('users');
    if (boardsRow.status === 'rejected') partialFailures.push('newsBoards');
    if (assetsRow.status === 'rejected') partialFailures.push('portfolioAssets');

    const response: UnifiedSearchResponse = {
      results: {
        coins: coinsRow.status === 'fulfilled' ? coinsRow.value : [],
        news: newsRow.status === 'fulfilled' ? newsRow.value : [],
        users: usersRow.status === 'fulfilled' ? usersRow.value : [],
        newsBoards: boardsRow.status === 'fulfilled' ? boardsRow.value : [],
        portfolioAssets: assetsRow.status === 'fulfilled' ? assetsRow.value : [],
      },
      meta: {
        tookMs: Date.now() - startedAt,
        query,
        segments,
        partialFailures: partialFailures.length > 0 ? partialFailures : undefined,
        nextCursor: params.cursor,
      },
    };

    await writeToCache(cacheKey, response);
    return response;
  },
};
