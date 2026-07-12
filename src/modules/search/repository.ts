import { LabeledActiveCoin } from '../coin/models/LabeledActiveCoin';
import { newsService } from '../news/service';
import { userService } from '../user/service';
import { config } from '../../config/env';
import { tokenize, allTokensMatchText } from './queryTokens';

export interface SearchCoinResult {
  internalCoinId?: string;
  coinId: string;
  symbol: string;
  name: string;
  rank?: number;
  price?: number;
  percentChange24h?: number;
  marketCap?: number;
  volume24h?: number;
  image?: string;
}

export interface SearchNewsResult {
  id: string;
  title: string;
  summary?: string;
  subtitle?: string;
  source?: string;
  url?: string;
  sourceUrl?: string;
  image?: string;
  relatedCoins?: string[];
  categories?: Array<{ key: string; name: string }>;
  publishedAt?: string | Date;
}

export interface SearchUserResult {
  id: string;
  username: string;
}

export interface SearchBoardResult {
  id: string;
  name: string;
  newsIds?: string[];
  itemCount?: number;
}

export interface SearchPortfolioAssetResult {
  id: string;
  symbol: string;
  name: string;
  balance?: number;
  valueUsd?: number;
  chain?: string;
}

const toCoinResult = (coin: any): SearchCoinResult | null => {
  const coinId = String(coin?.coinId || coin?.id || '');
  const symbol = String(coin?.symbol || '').toUpperCase();
  const name = String(coin?.name || '');
  if (!coinId || !symbol || !name) return null;

  return {
    internalCoinId: coin?.internalCoinId ? String(coin.internalCoinId) : undefined,
    coinId,
    symbol,
    name,
    rank: Number.isFinite(Number(coin?.rank)) ? Number(coin.rank) : undefined,
    price: Number.isFinite(Number(coin?.price)) ? Number(coin.price) : undefined,
    percentChange24h: Number.isFinite(Number(coin?.percentChange24h))
      ? Number(coin.percentChange24h)
      : undefined,
    marketCap: Number.isFinite(Number(coin?.marketCap)) ? Number(coin.marketCap) : undefined,
    volume24h: Number.isFinite(Number(coin?.volume24h)) ? Number(coin.volume24h) : undefined,
    image: coin?.image || coin?.logo,
  };
};

async function enrichCoinsWithImages(results: SearchCoinResult[]): Promise<SearchCoinResult[]> {
  if (results.length === 0) return results;
  try {
    const coinIds = [...new Set(results.map((r) => r.coinId))];
    const symbols = [...new Set(results.map((r) => r.symbol.toLowerCase()))];

    const labeled = await LabeledActiveCoin.find({
      provider: config.coinDataPrimarySnapshotProvider,
      $or: [{ id: { $in: coinIds } }, { symbol: { $in: symbols } }],
    })
      .select('id symbol image internalCoinId')
      .lean<Array<{ id: string; symbol: string; image?: string; internalCoinId?: string }>>();

    const byId = new Map<string, string>();
    const bySymbol = new Map<string, string>();
    const internalById = new Map<string, string>();
    const internalBySymbol = new Map<string, string>();
    for (const doc of labeled) {
      if (doc.image) {
        byId.set(doc.id.toLowerCase(), doc.image);
        bySymbol.set(doc.symbol.toLowerCase(), doc.image);
      }
      if (doc.internalCoinId) {
        internalById.set(doc.id.toLowerCase(), doc.internalCoinId);
        internalBySymbol.set(doc.symbol.toLowerCase(), doc.internalCoinId);
      }
    }

    return results.map((r) => {
      const image =
        byId.get(r.coinId.toLowerCase()) ?? bySymbol.get(r.symbol.toLowerCase()) ?? r.image;
      const internalCoinId =
        r.internalCoinId ??
        internalById.get(r.coinId.toLowerCase()) ??
        internalBySymbol.get(r.symbol.toLowerCase());
      return { ...r, image: image || r.image, internalCoinId };
    });
  } catch {
    return results;
  }
}

export const searchRepository = {
  async searchCoins(query: string, limit: number): Promise<SearchCoinResult[]> {
    try {
      const dynamicModule = require('../coin/repository');
      const coinRepository = dynamicModule?.coinRepository;
      if (!coinRepository) return [];

      const candidates: any[] = [];

      if (typeof coinRepository.searchByQuery === 'function') {
        const byQuery = await coinRepository.searchByQuery(query, limit);
        if (Array.isArray(byQuery)) candidates.push(...byQuery);
      } else if (typeof coinRepository.search === 'function') {
        const bySearch = await coinRepository.search(query, limit * 3);
        if (Array.isArray(bySearch)) candidates.push(...bySearch);
      } else if (typeof coinRepository.findTrending === 'function') {
        const trending = await coinRepository.findTrending(limit * 5);
        if (Array.isArray(trending)) candidates.push(...trending);
      }

      const tokens = tokenize(query);
      const unique = new Map<string, SearchCoinResult>();

      for (const candidate of candidates) {
        const mapped = toCoinResult(candidate);
        if (!mapped) continue;
        if (allTokensMatchText(tokens, [mapped.symbol, mapped.name, mapped.coinId])) {
          unique.set(mapped.coinId, mapped);
        }
      }

      const results = Array.from(unique.values()).slice(0, limit);
      return enrichCoinsWithImages(results);
    } catch {
      return [];
    }
  },

  async searchNews(query: string, limit: number, userId?: string): Promise<SearchNewsResult[]> {
    const { articles } = await newsService.searchArticlesForUnifiedSearch(query, limit, userId);
    return articles.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      subtitle: item.subtitle,
      source: item.source,
      url: item.url,
      sourceUrl: item.sourceUrl,
      image: item.image,
      relatedCoins: item.relatedCoins,
      categories: item.categories,
      publishedAt: item.publishedAt,
    }));
  },

  async searchUsers(query: string, limit: number): Promise<SearchUserResult[]> {
    try {
      return await userService.searchUsers(query, limit);
    } catch {
      return [];
    }
  },

  async searchNewsBoards(query: string, limit: number, userId?: string): Promise<SearchBoardResult[]> {
    if (!userId) return [];
    try {
      const dynamicModule = require('../newsboard/service');
      const boardService = dynamicModule?.newsBoardService;
      if (!boardService) return [];

      const boards = typeof boardService.getBoardsByUser === 'function'
        ? await boardService.getBoardsByUser(userId)
        : typeof boardService.getAllBoards === 'function'
          ? await boardService.getAllBoards(userId)
          : [];

      const tokens = tokenize(query);
      return (Array.isArray(boards) ? boards : [])
        .filter((board: any) => allTokensMatchText(tokens, [board?.name]))
        .slice(0, limit)
        .map((board: any) => ({
          id: String(board?.id || board?._id || ''),
          name: String(board?.name || ''),
          newsIds: Array.isArray(board?.newsIds) ? board.newsIds : [],
          itemCount: Array.isArray(board?.newsIds) ? board.newsIds.length : undefined,
        }))
        .filter((board: SearchBoardResult) => Boolean(board.id) && Boolean(board.name));
    } catch {
      return [];
    }
  },

  async searchPortfolioAssets(
    query: string,
    limit: number,
    userId?: string
  ): Promise<SearchPortfolioAssetResult[]> {
    if (!userId) return [];
    try {
      const dynamicModule = require('../portfolio/repository');
      const portfolioRepository = dynamicModule?.portfolioRepository;
      if (!portfolioRepository || typeof portfolioRepository.findHoldingsByUser !== 'function') {
        return [];
      }

      const holdings = await portfolioRepository.findHoldingsByUser(userId);
      const positions = Array.isArray(holdings?.positions) ? holdings.positions : [];
      const tokens = tokenize(query);

      return positions
        .filter((position: any) =>
          allTokensMatchText(tokens, [position?.symbol, position?.name, position?.chain])
        )
        .slice(0, limit)
        .map((position: any, index: number) => ({
          id: String(position?.id || position?.assetId || `${position?.symbol || 'asset'}-${index}`),
          symbol: String(position?.symbol || ''),
          name: String(position?.name || position?.symbol || ''),
          balance: Number.isFinite(Number(position?.balance)) ? Number(position.balance) : undefined,
          valueUsd: Number.isFinite(Number(position?.valueUsd || position?.usdValue))
            ? Number(position?.valueUsd || position?.usdValue)
            : undefined,
          chain: position?.chain ? String(position.chain) : undefined,
        }))
        .filter((asset: SearchPortfolioAssetResult) => Boolean(asset.id) && Boolean(asset.symbol));
    } catch {
      return [];
    }
  },
};
