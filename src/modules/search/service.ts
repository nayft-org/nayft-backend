import { Coin } from '../coin/model';
import { News } from '../news/model';

export const searchService = {
  search: async (query: string) => {
    const searchRegex = new RegExp(query, 'i');

    // Search coins
    const coins = await Coin.find({
      $or: [
        { name: searchRegex },
        { symbol: searchRegex },
      ],
    })
      .limit(10)
      .select('coinId symbol name price percentChange24h rank');

    // Search news
    const news = await News.find({
      $or: [
        { title: searchRegex },
        { summary: searchRegex },
        { source: searchRegex },
      ],
    })
      .limit(10)
      .select('title summary source url image publishedAt relatedCoins');

    return {
      coins: coins.map((coin) => ({
        coinId: coin.coinId,
        symbol: coin.symbol,
        name: coin.name,
        price: coin.price,
        percentChange24h: coin.percentChange24h,
        rank: coin.rank,
      })),
      news: news.map((item) => ({
        id: item._id.toString(),
        title: item.title,
        summary: item.summary,
        source: item.source,
        url: item.url,
        image: item.image,
        publishedAt: item.publishedAt,
      })),
    };
  },
};

