import { News } from '../modules/news/model';

export const seedGeneralNews = async () => {
  // Check if news already exists
  const existingNewsCount = await News.countDocuments();
  if (existingNewsCount > 0) {
    return; // News already exists
  }

  // General crypto news data (not tied to specific coins)
  const generalNews = [
    {
      title: 'Bitcoin Reaches New All-Time High Amid Institutional Adoption',
      summary: 'Bitcoin has surged to unprecedented levels as major institutions continue to adopt cryptocurrency, signaling a new era of mainstream acceptance.',
      source: 'CoinDesk',
      url: 'https://example.com/news/bitcoin-ath-1',
      image: 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg',
      relatedCoins: ['1', 'bitcoin'],
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    },
    {
      title: 'Ethereum Network Upgrade Successfully Deployed',
      summary: 'The highly anticipated Ethereum network upgrade has been successfully deployed, bringing improved scalability and reduced gas fees for users across the ecosystem.',
      source: 'The Block',
      url: 'https://example.com/news/ethereum-upgrade-1',
      image: 'https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg',
      relatedCoins: ['2', 'ethereum'],
      publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    },
    {
      title: 'Solana DeFi Protocol Reaches $1B in Total Value Locked',
      summary: 'A major Solana-based DeFi protocol has crossed the $1 billion milestone in total value locked, signaling growing adoption in the ecosystem.',
      source: 'Decrypt',
      url: 'https://example.com/news/solana-defi-1',
      image: 'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg',
      relatedCoins: ['825', 'solana'],
      publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
    },
    {
      title: 'Major Exchange Announces Support for New Trading Pairs',
      summary: 'Leading cryptocurrency exchange announces support for multiple new trading pairs, expanding options for traders worldwide.',
      source: 'CoinTelegraph',
      url: 'https://example.com/news/exchange-pairs-1',
      image: 'https://images.pexels.com/photos/6771607/pexels-photo-6771607.jpeg',
      relatedCoins: ['1', '2', '825'],
      publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7 hours ago
    },
    {
      title: 'NFT Market Shows Signs of Recovery with Record Sales',
      summary: 'The NFT marketplace is experiencing renewed interest with several high-profile sales breaking records this week.',
      source: 'NFT Now',
      url: 'https://example.com/news/nft-recovery-1',
      image: 'https://images.pexels.com/photos/8370752/pexels-photo-8370752.jpeg',
      relatedCoins: ['2', 'ethereum'],
      publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000), // 10 hours ago
    },
    {
      title: 'Regulatory Framework for Cryptocurrencies Gains Momentum',
      summary: 'Government officials are working on comprehensive regulatory frameworks that could shape the future of cryptocurrency adoption.',
      source: 'CryptoNews',
      url: 'https://example.com/news/regulation-1',
      image: 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg',
      relatedCoins: ['1', '2'],
      publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
    },
    {
      title: 'Layer 2 Solutions See Massive Growth in User Adoption',
      summary: 'Layer 2 scaling solutions are experiencing unprecedented growth as users seek faster and cheaper transactions.',
      source: 'BlockchainDaily',
      url: 'https://example.com/news/layer2-growth-1',
      image: 'https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg',
      relatedCoins: ['2', 'ethereum'],
      publishedAt: new Date(Date.now() - 15 * 60 * 60 * 1000), // 15 hours ago
    },
    {
      title: 'Stablecoin Market Cap Surpasses $150 Billion',
      summary: 'The total market capitalization of stablecoins has reached a new milestone, reflecting increased demand for digital dollar alternatives.',
      source: 'CoinAnalyst',
      url: 'https://example.com/news/stablecoin-mcap-1',
      image: 'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg',
      relatedCoins: ['1', '2'],
      publishedAt: new Date(Date.now() - 18 * 60 * 60 * 1000), // 18 hours ago
    },
    {
      title: 'Cross-Chain Bridge Technology Advances with New Protocol',
      summary: 'A new cross-chain bridge protocol has been launched, enabling seamless transfers between different blockchain networks.',
      source: 'The Block',
      url: 'https://example.com/news/crosschain-1',
      image: 'https://images.pexels.com/photos/6771607/pexels-photo-6771607.jpeg',
      relatedCoins: ['1', '2', '825'],
      publishedAt: new Date(Date.now() - 20 * 60 * 60 * 1000), // 20 hours ago
    },
    {
      title: 'Crypto Mining Industry Adapts to New Energy Standards',
      summary: 'Cryptocurrency mining operations are implementing more sustainable practices in response to environmental concerns and new regulations.',
      source: 'CoinDesk',
      url: 'https://example.com/news/mining-energy-1',
      image: 'https://images.pexels.com/photos/8370752/pexels-photo-8370752.jpeg',
      relatedCoins: ['1', 'bitcoin'],
      publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
    },
  ];

  // Insert general news
  await News.insertMany(generalNews);
  console.log(`✅ Seeded ${generalNews.length} general news items`);
};

