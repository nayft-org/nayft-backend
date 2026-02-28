import { coingeckoApi } from '../../utils/coingecko';
import { coinRepository } from './repository';
import { filteredCoinRepository } from './filteredCoinRepository';
import { labeledCoinRepository } from './labeledCoinRepository';
import { labeledActiveCoinRepository } from './labeledActiveCoinRepository';
import { marketRepository } from '../market/repository';
import { newsService } from '../news/service';
import { coindeskApi, normalizeArticle } from '../../utils/coindesk';

function looksLikeCoinGeckoId(id: string): boolean {
  if (!id || id.length < 2) return false;
  const trimmed = id.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return false;
  return /^[a-z0-9-]+$/.test(trimmed);
}

async function resolveToCoinGeckoId(coinId: string): Promise<string | null> {
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

function mapFilteredCoinToDto(filtered: { base_asset: string; symbol: string; provider: string }) {
  const symbol = filtered.base_asset.toUpperCase();
  return {
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

function mapCoinGeckoToDto(coin: Awaited<ReturnType<typeof coingeckoApi.getCoinById>>) {
  const price = coin.market_data?.current_price?.usd ?? 0;
  const percentChange24h = coin.market_data?.price_change_percentage_24h ?? 0;
  const marketCap = coin.market_data?.market_cap?.usd ?? 0;
  const volume24h = coin.market_data?.total_volume?.usd ?? 0;
  const image =
    coin.image?.large || coin.image?.small || coin.image?.thumb || undefined;
  return {
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

export const coinService = {
  getCoinProfile: async (coinId: string) => {
    const actualCoinId = coinId.includes('=') ? coinId.split('=')[1] : coinId;

    const filteredCoin = await filteredCoinRepository.findByBaseAsset(actualCoinId);
    if (filteredCoin) {
      return mapFilteredCoinToDto(filteredCoin);
    }

    let coinGeckoId: string | null = null;
    if (looksLikeCoinGeckoId(actualCoinId)) {
      try {
        const coin = await coingeckoApi.getCoinById(actualCoinId);
        const coinDto = mapCoinGeckoToDto(coin);
        await marketRepository.upsertCoin({
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

    if (!coinGeckoId) {
      coinGeckoId = await resolveToCoinGeckoId(coinId);
    }

    if (!coinGeckoId) {
      const dbCoin =
        (await coinRepository.findById(actualCoinId)) ||
        (await coinRepository.findBySymbol(actualCoinId));
      if (dbCoin) {
        return {
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

    const coin = await coingeckoApi.getCoinById(coinGeckoId);
    const coinDto = mapCoinGeckoToDto(coin);

    await marketRepository.upsertCoin({
      coinId: coinDto.coinId,
      symbol: coinDto.symbol,
      name: coinDto.name,
      rank: coinDto.rank,
      price: coinDto.price,
      percentChange24h: coinDto.percentChange24h,
    });

    return coinDto;
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

  getCoinNews: async (coinId: string) => {
    const symbol = await resolveToSymbol(coinId);
    if (!symbol) return [];

    const fromNewsArticles = await newsService.getNewsByCoinSymbol(symbol, 20);
    if (fromNewsArticles.length > 0) {
      return fromNewsArticles;
    }

    const articles = await coindeskApi.getNewsByTickers([symbol], 1, 20);
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
