import { userRepository } from './repository';
import { followService } from '../follow/service';
import { isSupportedLanguage } from './supportedLanguages';

export const userService = {
  getPreferences: async (userId: string): Promise<{ preferredLanguage: string | null }> => {
    const preferredLanguage = await userRepository.getPreferredLanguage(userId);
    return { preferredLanguage };
  },

  updatePreferences: async (
    userId: string,
    preferredLanguage: string
  ): Promise<{ preferredLanguage: string }> => {
    if (!isSupportedLanguage(preferredLanguage)) {
      throw new Error('Unsupported language');
    }
    await userRepository.setPreferredLanguage(userId, preferredLanguage);
    return { preferredLanguage };
  },

  toggleFollowCoin: async (userId: string, coinId: string) => {
    const isFollowing = await followService.isFollowingCoin(userId, coinId);
    if (isFollowing) {
      await followService.unfollowCoin(userId, coinId);
    } else {
      await followService.followCoin(userId, coinId);
    }
    await followService.syncLegacyFollowingCoins(userId);

    return {
      message: isFollowing ? 'Coin unfollowed' : 'Coin followed',
      following: !isFollowing,
    };
  },

  searchUsers: async (query: string, limit: number = 5) => {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query is required');
    }
    const users = await userRepository.searchByUsername(query.trim(), limit);
    return users.map((u: any) => ({ id: u._id, username: u.username }));
  },
};

