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
};

