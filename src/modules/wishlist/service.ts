import { wishlistRepository } from './repository';
import { coinRepository } from '../coin/repository';
import { followService } from '../follow/service';

export const wishlistService = {
  addToWishlist: async (userId: string, coinId: string) => {
    // Check if coin exists
    const coin = await coinRepository.findById(coinId);
    if (!coin) {
      throw new Error('Coin not found');
    }

    const existing = await wishlistRepository.findByUserAndCoin(userId, coinId);
    if (!existing) {
      await wishlistRepository.create(userId, coinId);
    }

    await followService.followCoin(userId, coinId);
    await followService.syncLegacyFollowingCoins(userId);
    return { message: 'Coin added to wishlist' };
  },

  removeFromWishlist: async (userId: string, coinId: string) => {
    await wishlistRepository.delete(userId, coinId);
    await followService.unfollowCoin(userId, coinId);
    await followService.syncLegacyFollowingCoins(userId);
    return { message: 'Coin removed from wishlist' };
  },

  getWishlist: async (userId: string) => {
    const coinIds = await followService.getFollowedCoinIds(userId);

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

