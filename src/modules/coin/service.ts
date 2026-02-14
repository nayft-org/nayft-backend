import { coingeckoApi } from '../../utils/coingecko';
import { coinmarketcapApi } from '../../utils/coinmarketcap';
import { coinRepository } from './repository';
import { marketRepository } from '../market/repository';
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
    let symbol: string | null = null;
    const dbCoin = await coinRepository.findById(numericId);
    if (dbCoin?.symbol) {
      symbol = dbCoin.symbol;
    } else {
      try {
        const cmcResponse = await coinmarketcapApi.getQuotesLatestById(numericId);
        const data = (cmcResponse as any)?.data;
        const coinData = data ? Object.values(data)[0] : null;
        if (coinData && typeof coinData === 'object' && 'symbol' in coinData) {
          symbol = (coinData as any).symbol;
        }
      } catch {
        // CMC fallback failed
      }
    }
    if (symbol) {
      const match = list.find((c) => c.symbol.toUpperCase() === symbol!.toUpperCase());
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
    try {
      const cmcResponse = await coinmarketcapApi.getQuotesLatestById(numericId);
      const data = (cmcResponse as any)?.data;
      const coinData = data ? Object.values(data)[0] : null;
      if (coinData && typeof coinData === 'object' && 'symbol' in coinData) {
        return (coinData as any).symbol;
      }
    } catch {
      // CMC fallback failed
    }
  }

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
    console.log("coinService.getCoinProfile", coinId);
    const actualCoinId = coinId.includes('=') ? coinId.split('=')[1] : coinId;
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

  getCoinNews: async (coinId: string) => {
    const symbol = await resolveToSymbol(coinId);
    if (!symbol) return [];

    const articles = await coindeskApi.getNewsByTickers([symbol], 1, 20);

    return articles.map((raw) => {
      const article = normalizeArticle(raw);
      return {
        id: article.id,
        title: article.title || article.headline || 'Untitled',
        summary: article.summary || article.description || '',
        source: article.source || 'CoinDesk',
        url: article.url,
        image: article.imageUrl,
        relatedCoins: [coinId],
        publishedAt: new Date(article.publishedAt),
      };
    });
  },
};
