import { News } from '../modules/news/model';

export const seedSampleNews = async (coinId: string) => {
  // Check if news already exists for this coin
  const existingNews = await News.findOne({ relatedCoins: coinId });
  if (existingNews) {
    return; // News already exists
  }

  // Sample news data for the coin
  const sampleNews = [
    {
      title: `Major Development Announced for Cryptocurrency`,
      summary: `Significant updates and improvements have been announced for this cryptocurrency, including enhanced security features and improved transaction speeds.`,
      source: 'CryptoNews',
      url: `https://example.com/news/${coinId}-1`,
      image: 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg',
      relatedCoins: [coinId],
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
    {
      title: `Market Analysis: Price Trends and Future Outlook`,
      summary: `Expert analysts provide insights into current market trends and potential future developments for this digital asset.`,
      source: 'CoinAnalyst',
      url: `https://example.com/news/${coinId}-2`,
      image: 'https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg',
      relatedCoins: [coinId],
      publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
    },
    {
      title: `Partnership Announcement Expands Ecosystem`,
      summary: `A new strategic partnership has been formed, expanding the ecosystem and opening new opportunities for users and developers.`,
      source: 'BlockchainDaily',
      url: `https://example.com/news/${coinId}-3`,
      image: 'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg',
      relatedCoins: [coinId],
      publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
    },
  ];

  // Insert sample news
  await News.insertMany(sampleNews);
};

