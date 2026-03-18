import { userRepository } from './repository';
import { followService } from '../follow/service';

export const userService = {
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

