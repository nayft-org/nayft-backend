import { wishlistRepository } from './repository';
import { coinRepository } from '../coin/repository';

export const wishlistService = {
  addToWishlist: async (userId: string, coinId: string) => {
    // Check if coin exists
    const coin = await coinRepository.findById(coinId);
    if (!coin) {
      throw new Error('Coin not found');
    }

    // Check if already in wishlist
    const existing = await wishlistRepository.findByUserAndCoin(userId, coinId);
    if (existing) {
      throw new Error('Coin already in wishlist');
    }

    await wishlistRepository.create(userId, coinId);
    return { message: 'Coin added to wishlist' };
  },

  removeFromWishlist: async (userId: string, coinId: string) => {
    const deleted = await wishlistRepository.delete(userId, coinId);
    if (!deleted) {
      throw new Error('Coin not found in wishlist');
    }
    return { message: 'Coin removed from wishlist' };
  },

  getWishlist: async (userId: string) => {
    const wishlistItems = await wishlistRepository.findByUser(userId);
    const coinIds = wishlistItems.map((item) => item.coinId);

    const coins = await Promise.all(
      coinIds.map(async (coinId) => {
        const coin = await coinRepository.findById(coinId);
        if (!coin) return null;
        return {
          coinId: coin.coinId,
          symbol: coin.symbol,
          name: coin.name,
          price: coin.price,
          percentChange24h: coin.percentChange24h,
          rank: coin.rank,
        };
      })
    );

    return coins.filter((coin) => coin !== null);
  },
};

