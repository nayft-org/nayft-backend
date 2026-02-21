import { userRepository } from './repository';

export const userService = {
  toggleFollowCoin: async (userId: string, coinId: string) => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const isFollowing = user.followingCoins.includes(coinId);
    await userRepository.updateFollowingCoins(userId, coinId, !isFollowing);

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

