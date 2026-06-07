import { coingeckoApi } from '../../utils/coingecko';
import { config } from '../../config/env';
import { withResponseCache } from '../../utils/responseCache';
import { coinRepository } from './repository';
import { filteredCoinRepository } from './filteredCoinRepository';
import { labeledCoinRepository } from './labeledCoinRepository';
import { labeledActiveCoinRepository } from './labeledActiveCoinRepository';
import { cmcLabeledCoinRepository } from './cmcLabeledCoinRepository';
import { marketRepository } from '../market/repository';
import { newsService } from '../news/service';
import { coindeskApi, normalizeArticle } from '../../utils/coindesk';
import { identityResolver } from './identityResolver';
import { resolveBatchFromSnapshots } from './coinSnapshotResolve';

function looksLikeCoinGeckoId(id: string): boolean {
  if (!id || id.length < 2) return false;
  const trimmed = id.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return false;
  return /^[a-z0-9-]+$/.test(trimmed);
}

const RESOLVE_MEMO_TTL_MS = 90_000;
const RESOLVE_MEMO_MAX = 500;

type ResolveMemoEntry = {
  promise: Promise<string | null>;
  expiresAt: number;
  insertedAt: number;
};

const resolveToCoinGeckoIdMemo = new Map<string, ResolveMemoEntry>();

function sweepResolveMemoOnWrite(): void {
  const now = Date.now();
  for (const [k, e] of resolveToCoinGeckoIdMemo) {
    if (now > e.expiresAt) {
      resolveToCoinGeckoIdMemo.delete(k);
    }
  }
  while (resolveToCoinGeckoIdMemo.size > RESOLVE_MEMO_MAX) {
    let oldestKey: string | null = null;
    let oldestIns = Infinity;
    for (const [k, e] of resolveToCoinGeckoIdMemo) {
      if (e.insertedAt < oldestIns) {
        oldestIns = e.insertedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) resolveToCoinGeckoIdMemo.delete(oldestKey);
    else break;
  }
}

/** Uncached CoinGecko id resolution (list scan + optional validation). */
async function resolveToCoinGeckoIdUncached(coinId: string): Promise<string | null> {
  const actualCoinId = coinId.includes('=') ? coinId.split('=')[1] : coinId;
  const numericId = actualCoinId.replace(/[^0-9]/g, '');
  const isNumericId = numericId.length > 0 && !isNaN(Number(numericId));

  if (looksLikeCoinGeckoId(actualCoinId)) {
    try {
      await coingeckoApi.getCoinById(actualCoinId);
      return actualCoinId;
    } catch {
      return null;
    }
  }

  const list = await coingeckoApi.getCoinsList();
  const upperSymbol = actualCoinId.toUpperCase();

  if (isNumericId) {
    const dbCoin = await coinRepository.findById(numericId);
    if (dbCoin?.symbol) {
      const symbol = dbCoin.symbol;
      const match = list.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
      if (match) return match.id;
    }
  }

  const match = list.find((c) => c.symbol.toUpperCase() === upperSymbol);
  if (match) return match.id;

  const byId = list.find((c) => c.id.toLowerCase() === actualCoinId.toLowerCase());
  if (byId) return byId.id;

  return null;
}

/** Memoized wrapper: shared in-flight promise + TTL memo for repeated lookups (same file as Map). */
async function resolveToCoinGeckoId(coinId: string): Promise<string | null> {
  const key = (coinId.includes('=') ? coinId.split('=')[1] : coinId).trim();
  if (!key) {
    return resolveToCoinGeckoIdUncached(coinId);
  }
  sweepResolveMemoOnWrite();
  const hit = resolveToCoinGeckoIdMemo.get(key);
  if (hit && Date.now() <= hit.expiresAt) {
    return hit.promise;
  }
  const now = Date.now();
  const promise = resolveToCoinGeckoIdUncached(coinId);
  resolveToCoinGeckoIdMemo.set(key, {
    promise,
    expiresAt: now + RESOLVE_MEMO_TTL_MS,
    insertedAt: now,
  });
  sweepResolveMemoOnWrite();
  return promise;
}

async function resolveToSymbol(coinId: string): Promise<string | null> {
  const actualCoinId = coinId.includes('=') ? coinId.split('=')[1] : coinId;
  const numericId = actualCoinId.replace(/[^0-9]/g, '');
  const isNumericId = numericId.length > 0 && !isNaN(Number(numericId));

  if (isNumericId) {
    const dbCoin = await coinRepository.findById(numericId);
    if (dbCoin?.symbol) return dbCoin.symbol;
  }

  const filteredCoin = await filteredCoinRepository.findByBaseAsset(actualCoinId);
  if (filteredCoin?.base_asset) return filteredCoin.base_asset;

  const dbCoin = await coinRepository.findBySymbol(actualCoinId);
  if (dbCoin?.symbol) return dbCoin.symbol;

  try {
    const coinGeckoId = await resolveToCoinGeckoId(coinId);
    if (coinGeckoId) {
      const coin = await coingeckoApi.getCoinById(coinGeckoId);
      return coin.symbol?.toUpperCase() || null;
    }
  } catch {
    // ignore
  }

  return actualCoinId.toUpperCase();
}

function mapFilteredCoinToDto(
  filtered: { base_asset: string; symbol: string; provider: string },
  internalCoinId: string | null
) {
  const symbol = filtered.base_asset.toUpperCase();
  return {
    internalCoinId,
    coinId: symbol,
    symbol,
    name: symbol,
    rank: 0,
    price: 0,
    percentChange24h: 0,
    marketCap: undefined,
    volume24h: undefined,
    image: undefined,
  };
}

function mapCoinGeckoToDto(
  coin: Awaited<ReturnType<typeof coingeckoApi.getCoinById>>,
  internalCoinId: string | null
) {
  const price = coin.market_data?.current_price?.usd ?? 0;
  const percentChange24h = coin.market_data?.price_change_percentage_24h ?? 0;
  const marketCap = coin.market_data?.market_cap?.usd ?? 0;
  const volume24h = coin.market_data?.total_volume?.usd ?? 0;
  const image =
    coin.image?.large || coin.image?.small || coin.image?.thumb || undefined;
  return {
    internalCoinId,
    coinId: coin.id,
    symbol: (coin.symbol || '').toUpperCase(),
    name: coin.name || '',
    rank: coin.market_cap_rank ?? 0,
    price,
    percentChange24h,
    marketCap,
    volume24h,
    image,
  };
}

function mapLocalCoinToDto(params: {
  dbCoin?: {
    internalCoinId?: string;
    coinId: string;
    symbol: string;
    name: string;
    rank?: number;
    price?: number;
    percentChange24h?: number;
  } | null;
  snapshot?: {
    id: string;
    image?: string;
    current_price?: number;
    market_cap?: number;
    market_cap_rank?: number;
    total_volume?: number;
  } | null;
  internalCoinId: string | null;
}) {
  const { dbCoin, snapshot, internalCoinId } = params;
  const resolvedCoinId = dbCoin?.coinId ?? snapshot?.id ?? '';
  const resolvedSymbol = dbCoin?.symbol ?? '';
  const resolvedName = dbCoin?.name ?? resolvedSymbol;

  if (!resolvedCoinId || !resolvedSymbol || !resolvedName) {
    return null;
  }

  return {
    internalCoinId: dbCoin?.internalCoinId ?? internalCoinId,
    coinId: resolvedCoinId,
    symbol: resolvedSymbol,
    name: resolvedName,
    rank: dbCoin?.rank ?? snapshot?.market_cap_rank ?? 0,
    price: dbCoin?.price ?? snapshot?.current_price ?? 0,
    percentChange24h: dbCoin?.percentChange24h ?? 0,
    marketCap: snapshot?.market_cap,
    volume24h: snapshot?.total_volume,
    image: snapshot?.image,
  };
}

export const coinService = {
  getCoinProfile: async (coinId: string) => {
    const actualCoinId = coinId.includes('=') ? coinId.split('=')[1] : coinId;
    const resolution = await identityResolver.resolve(actualCoinId);

    // Parallelize DB lookups first - fast path
    const [filteredCoin, dbCoinById, dbCoinBySymbol] = await Promise.all([
      filteredCoinRepository.findByBaseAsset(actualCoinId),
      coinRepository.findById(actualCoinId),
      coinRepository.findBySymbol(actualCoinId),
    ]);

    if (filteredCoin) {
      return mapFilteredCoinToDto(filteredCoin, resolution.internalCoinId);
    }

    // Check if we found it in local DB
    const dbCoin = dbCoinById || dbCoinBySymbol;
    if (config.coinProfileLocalFirstEnabled) {
      const snapshot = await labeledActiveCoinRepository.findByCoinId(actualCoinId);
      const localDto = mapLocalCoinToDto({
        dbCoin,
        snapshot,
        internalCoinId: resolution.internalCoinId,
      });
      if (localDto) {
        return localDto;
      }
    }

    if (dbCoin && looksLikeCoinGeckoId(actualCoinId)) {
      // Return DB data immediately if we have it
      return {
        internalCoinId: dbCoin.internalCoinId ?? resolution.internalCoinId,
        coinId: dbCoin.coinId,
        symbol: dbCoin.symbol,
        name: dbCoin.name,
        rank: dbCoin.rank,
        price: dbCoin.price,
        percentChange24h: dbCoin.percentChange24h,
        image: undefined,
      };
    }

    // Try CoinGecko API if it looks like a CoinGecko ID
    let coinGeckoId: string | null = null;
    if (looksLikeCoinGeckoId(actualCoinId)) {
      try {
        const coin = await coingeckoApi.getCoinById(actualCoinId);
        const coinDto = mapCoinGeckoToDto(coin, resolution.internalCoinId);
        await marketRepository.upsertCoin({
          internalCoinId: coinDto.internalCoinId ?? undefined,
          coinId: coinDto.coinId,
          symbol: coinDto.symbol,
          name: coinDto.name,
          rank: coinDto.rank,
          price: coinDto.price,
          percentChange24h: coinDto.percentChange24h,
        });
        return coinDto;
      } catch {
        coinGeckoId = null;
      }
    }

    // Try resolution
    if (!coinGeckoId) {
      coinGeckoId = await resolveToCoinGeckoId(coinId);
    }

    // If still no CoinGecko ID, return DB data if we have it
    if (!coinGeckoId) {
      if (dbCoin) {
        return {
          internalCoinId: dbCoin.internalCoinId ?? resolution.internalCoinId,
          coinId: dbCoin.coinId,
          symbol: dbCoin.symbol,
          name: dbCoin.name,
          rank: dbCoin.rank,
          price: dbCoin.price,
          percentChange24h: dbCoin.percentChange24h,
          image: undefined,
        };
      }
      throw new Error('Coin not found');
    }

    // Final API call with resolved CoinGecko ID
    const coin = await coingeckoApi.getCoinById(coinGeckoId);
    const coinDto = mapCoinGeckoToDto(coin, resolution.internalCoinId);

    await marketRepository.upsertCoin({
      internalCoinId: coinDto.internalCoinId ?? undefined,
      coinId: coinDto.coinId,
      symbol: coinDto.symbol,
      name: coinDto.name,
      rank: coinDto.rank,
      price: coinDto.price,
      percentChange24h: coinDto.percentChange24h,
    });

    return coinDto;
  },

  /** Batch resolve coin refs (symbols, CoinGecko ids) from `coin_market_snapshots` for news/UI hydration. */
  getCoinsByIds: async (coinIds: string[]) => {
    const resolved = await resolveBatchFromSnapshots(coinIds);
    return resolved.map((c) => ({
      internalCoinId: c.internalCoinId,
      coinId: c.coinId,
      symbol: c.symbol,
      name: c.name,
      rank: c.marketCapRank ?? 0,
      price: c.price,
      percentChange24h: c.percentChange24h,
      image: c.image,
      marketCapRank: c.marketCapRank,
    }));
  },

  populateLabeledCoins: async () => {
    return labeledCoinRepository.populateFromCoinGeckoAndFilteredCoins();
  },

  populateLabeledActiveCoins: async (page: number) => {
    if (page < 1 || page > 35) {
      throw new Error('Page must be between 1 and 35');
    }
    return labeledActiveCoinRepository.populateFromCoinGeckoMarketsPage(page);
  },

  populateCmcLabeledCoins: async (start: number) => {
    if (start < 1 || start > 8701) {
      throw new Error('Start must be between 1 and 8701');
    }
    return cmcLabeledCoinRepository.populateFromCmcPage(start);
  },

  getCoinStats: async (coinId: string) => {
    const coinGeckoId = await resolveToCoinGeckoId(coinId);
    const lookupId = coinGeckoId ?? (coinId.includes('=') ? coinId.split('=')[1] : coinId);
    const doc = await labeledActiveCoinRepository.findByCoinId(lookupId);
    if (!doc) return null;

    let contract_address: string | null = null;
    try {
      const { data } = await withResponseCache({
        cacheKey: `cg:coin:platform:${doc.id}`,
        ttlSeconds: 86400,
        metricsKind: 'coin:cgPlatform',
        fetcher: async () => {
          const fullCoin = await Promise.race([
            coingeckoApi.getCoinById(doc.id),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('coingecko_timeout')), 5000)
            ),
          ]);
          const platform = (fullCoin as any).platform;
          if (platform && typeof platform === 'object') {
            const addrs = Object.values(platform).filter((v): v is string => typeof v === 'string' && v !== '');
            return addrs[0] ?? null;
          }
          return null;
        },
      });
      contract_address = data;
    } catch {
      contract_address = null;
    }

    return {
      internalCoinId: (doc as any).internalCoinId ?? coinGeckoId ?? lookupId,
      coinId: doc.id,
      image: doc.image,
      current_price: doc.current_price,
      market_cap: doc.market_cap,
      market_cap_rank: doc.market_cap_rank,
      fully_diluted_valuation: doc.fully_diluted_valuation,
      total_volume: doc.total_volume,
      high_24h: doc.high_24h,
      low_24h: doc.low_24h,
      circulating_supply: doc.circulating_supply,
      total_supply: doc.total_supply,
      max_supply: doc.max_supply,
      ath: doc.ath,
      ath_date: doc.ath_date,
      atl: doc.atl,
      atl_date: doc.atl_date,
      contract_address,
    };
  },

  getCoinNews: async (coinId: string) => {
    const symbol = await resolveToSymbol(coinId);
    if (!symbol) return [];

    const fromNewsArticles = await newsService.getNewsByCoinSymbol(symbol, 20);
    if (fromNewsArticles.length > 0) {
      return fromNewsArticles;
    }

    if (!config.enableCoindeskNewsFallback) {
      return [];
    }

    let articles: Awaited<ReturnType<typeof coindeskApi.getNewsByTickers>>;
    try {
      articles = await Promise.race([
        coindeskApi.getNewsByTickers([symbol], 1, 20),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('coindesk_timeout')), 2000)),
      ]);
    } catch {
      return [];
    }

    return articles.map((raw) => {
      const article = normalizeArticle(raw);
      return {
        id: article.id,
        title: article.title || article.headline || 'Untitled',
        summary: article.summary || article.description || '',
        source: article.source || 'CoinDesk',
        sourceUrl: article.url,
        url: article.url,
        image: article.imageUrl,
        relatedCoins: [coinId],
        publishedAt: new Date(article.publishedAt),
      };
    });
  },
};
