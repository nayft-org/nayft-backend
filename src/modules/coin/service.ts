import { coinmarketcapApi } from '../../utils/coinmarketcap';
import { coinRepository } from './repository';
import { marketRepository } from '../market/repository';
import { coindeskApi, normalizeArticle, extractTickers } from '../../utils/coindesk';

export const coinService = {
  getCoinProfile: async (coinId: string) => {
    // Extract actual ID if it's in format "coinId=825" or similar
    let actualCoinId = coinId;
    if (coinId.includes('=')) {
      actualCoinId = coinId.split('=')[1];
    }
    
    // Remove any non-numeric characters if it's supposed to be a numeric ID
    const numericId = actualCoinId.replace(/[^0-9]/g, '');
    const isNumericId = numericId.length > 0 && !isNaN(Number(numericId));
    
    try {
      // Try to get from CoinMarketCap API
      let cmcResponse;
      
      try {
        if (isNumericId) {
          // For numeric IDs, use the quotes endpoint with id parameter
          cmcResponse = await coinmarketcapApi.getQuotesLatestById(numericId);
        } else {
          // Try as symbol (uppercase for CoinMarketCap)
          cmcResponse = await coinmarketcapApi.getQuotesLatest(actualCoinId.toUpperCase());
        }
      } catch (error: any) {
        // If numeric ID lookup fails, try getting info first to get symbol
        if (isNumericId) {
          try {
            const infoResponse = await coinmarketcapApi.getCryptocurrencyInfo(numericId);
            if (infoResponse.data && Object.keys(infoResponse.data).length > 0) {
              const coinInfo = Object.values(infoResponse.data)[0] as any;
              cmcResponse = await coinmarketcapApi.getQuotesLatest(coinInfo.symbol);
            } else {
              throw new Error('Coin info not found');
            }
          } catch (infoError) {
            throw error;
          }
        } else {
          // If symbol lookup fails, try to find in database first
          const dbCoin = await coinRepository.findBySymbol(actualCoinId);
          if (dbCoin) {
            // Try with the symbol from database
            cmcResponse = await coinmarketcapApi.getQuotesLatest(dbCoin.symbol);
          } else {
            throw error;
          }
        }
      }
      
      if (cmcResponse && cmcResponse.data) {
        // Handle both array and object formats from CoinMarketCap API
        let coinData: any;
        if (Array.isArray(cmcResponse.data)) {
          coinData = cmcResponse.data[0];
        } else if (typeof cmcResponse.data === 'object' && Object.keys(cmcResponse.data).length > 0) {
          coinData = Object.values(cmcResponse.data)[0];
        } else {
          throw new Error('Invalid response format from CoinMarketCap API');
        }
        
        if (!coinData) {
          throw new Error('Coin data not found in API response');
        }
        
        const coin = {
          coinId: coinData.id?.toString() || (isNumericId ? numericId : actualCoinId),
          symbol: coinData.symbol || '',
          name: coinData.name || '',
          rank: coinData.cmc_rank || 0,
          price: coinData.quote?.USD?.price || 0,
          percentChange24h: coinData.quote?.USD?.percent_change_24h || 0,
          marketCap: coinData.quote?.USD?.market_cap || 0,
          volume24h: coinData.quote?.USD?.volume_24h || 0,
          circulatingSupply: coinData.circulating_supply || 0,
          totalSupply: coinData.total_supply || 0,
          maxSupply: coinData.max_supply || null,
          description: coinData.description || '',
          website: coinData.urls?.website?.[0] || '',
          explorer: coinData.urls?.explorer?.[0] || '',
        };

        // Update database
        await marketRepository.upsertCoin({
          coinId: coin.coinId,
          symbol: coin.symbol,
          name: coin.name,
          rank: coin.rank,
          price: coin.price,
          percentChange24h: coin.percentChange24h,
        });

        return coin;
      }
    } catch (error: any) {
      console.log(error);
      console.error('CoinMarketCap API error:', error.message);
    }

    // Fallback to database - try by ID first, then by symbol
    let dbCoin = await coinRepository.findById(isNumericId ? numericId : actualCoinId);
    if (!dbCoin) {
      dbCoin = await coinRepository.findBySymbol(actualCoinId);
    }
    
    if (!dbCoin) {
      throw new Error('Coin not found');
    }

    return {
      coinId: dbCoin.coinId,
      symbol: dbCoin.symbol,
      name: dbCoin.name,
      rank: dbCoin.rank,
      price: dbCoin.price,
      percentChange24h: dbCoin.percentChange24h,
    };
  },

  getCoinNews: async (coinId: string) => {
    // Extract actual ID if it's in format "coinId=825" or similar
    let actualCoinId = coinId;
    if (coinId.includes('=')) {
      actualCoinId = coinId.split('=')[1];
    }
    
    // Remove any non-numeric characters if it's supposed to be a numeric ID
    const numericId = actualCoinId.replace(/[^0-9]/g, '');
    const isNumericId = numericId.length > 0 && !isNaN(Number(numericId));
    
    // Resolve symbol for this coin
    let symbol: string | null = null;

    if (isNumericId) {
      const dbCoin = await coinRepository.findById(numericId);
      if (dbCoin?.symbol) {
        symbol = dbCoin.symbol;
      }
    } else {
      const dbCoin = await coinRepository.findBySymbol(actualCoinId);
      if (dbCoin?.symbol) {
        symbol = dbCoin.symbol;
      } else {
        symbol = actualCoinId.toUpperCase();
      }
    }

    if (!symbol) {
      return [];
    }

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
        publishedAt: new Date(article.publishedAt),
      };
    });
  },
};
