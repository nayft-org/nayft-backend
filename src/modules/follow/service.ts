import { authRepository } from '../auth/repository';
import { coinRepository } from '../coin/repository';
import { userRepository } from '../user/repository';
import { followRepository } from './repository';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const clampPagination = (page?: number, limit?: number): { page: number; limit: number } => ({
  page: Math.max(1, page || 1),
  limit: Math.max(1, Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)),
});

export const followService = {
  followCoin: async (followerId: string, coinId: string) => {
    const coin = await coinRepository.findById(coinId);
    if (!coin) {
      throw new Error('Coin not found');
    }

    const alreadyFollowing = await followRepository.exists(followerId, 'coin', coinId);
    if (!alreadyFollowing) {
      await followRepository.upsert(followerId, 'coin', coinId);
    }

    const followersCount = await followRepository.countByTarget('coin', coinId);
    return { followed: true, targetType: 'coin', targetId: coinId, followersCount };
  },

  unfollowCoin: async (followerId: string, coinId: string) => {
    await followRepository.delete(followerId, 'coin', coinId);
    const followersCount = await followRepository.countByTarget('coin', coinId);
    return { followed: false, targetType: 'coin', targetId: coinId, followersCount };
  },

  followUser: async (followerId: string, targetUserId: string) => {
    if (followerId === targetUserId) {
      throw new Error('You cannot follow yourself');
    }

    const user = await authRepository.findById(targetUserId);
    if (!user) {
      throw new Error('User not found');
    }

    const alreadyFollowing = await followRepository.exists(followerId, 'user', targetUserId);
    if (!alreadyFollowing) {
      await followRepository.upsert(followerId, 'user', targetUserId);
    }

    const followersCount = await followRepository.countByTarget('user', targetUserId);
    return { followed: true, targetType: 'user', targetId: targetUserId, followersCount };
  },

  unfollowUser: async (followerId: string, targetUserId: string) => {
    if (followerId === targetUserId) {
      throw new Error('You cannot unfollow yourself');
    }

    await followRepository.delete(followerId, 'user', targetUserId);
    const followersCount = await followRepository.countByTarget('user', targetUserId);
    return { followed: false, targetType: 'user', targetId: targetUserId, followersCount };
  },

  getFollowedCoinIds: async (userId: string): Promise<string[]> => {
    return followRepository.findTargetIdsByFollower(userId, 'coin');
  },

  getFollowedUserIds: async (userId: string): Promise<string[]> => {
    return followRepository.findTargetIdsByFollower(userId, 'user');
  },

  getFollowedCoins: async (userId: string) => {
    const coinIds = await followRepository.findTargetIdsByFollower(userId, 'coin');
    
    if (coinIds.length === 0) return [];
    
    // Batch fetch coins and follower counts
    const [coins, followerCountsMap] = await Promise.all([
      coinRepository.findByIds(coinIds),
      followRepository.countByTargets('coin', coinIds)
    ]);
    
    return coins.map((coin) => ({
      coinId: coin.coinId,
      symbol: coin.symbol,
      name: coin.name,
      rank: coin.rank,
      price: coin.price,
      percentChange24h: coin.percentChange24h,
      followersCount: followerCountsMap.get(coin.coinId) || 0,
    }));
  },

  getFollowedUsers: async (userId: string) => {
    const userIds = await followRepository.findTargetIdsByFollower(userId, 'user');
    const users = await Promise.all(
      userIds.map(async (id) => {
        const user = await authRepository.findById(id);
        if (!user) return null;
        const followersCount = await followRepository.countByTarget('user', id);
        return { id, username: user.username, followersCount };
      })
    );
    return users.filter((user) => user !== null);
  },

  getUserFollowers: async (targetUserId: string, page?: number, limit?: number) => {
    const { page: safePage, limit: safeLimit } = clampPagination(page, limit);
    const rows = await followRepository.findFollowers('user', targetUserId, safePage, safeLimit);

    const followers = await Promise.all(
      rows.map(async (row) => {
        const user = await authRepository.findById(row.followerId);
        if (!user) return null;
        return {
          id: row.followerId,
          username: user.username,
          followedAt: row.createdAt,
        };
      })
    );

    return followers.filter((follower) => follower !== null);
  },

  getCoinFollowers: async (coinId: string, page?: number, limit?: number) => {
    const coin = await coinRepository.findById(coinId);
    if (!coin) {
      throw new Error('Coin not found');
    }

    const { page: safePage, limit: safeLimit } = clampPagination(page, limit);
    const rows = await followRepository.findFollowers('coin', coinId, safePage, safeLimit);

    const followers = await Promise.all(
      rows.map(async (row) => {
        const user = await authRepository.findById(row.followerId);
        if (!user) return null;
        return {
          id: row.followerId,
          username: user.username,
          followedAt: row.createdAt,
        };
      })
    );

    return followers.filter((follower) => follower !== null);
  },

  getUserFollowStats: async (userId: string) => {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const [followersCount, followingUsersCount, followingCoinsCount] = await Promise.all([
      followRepository.countByTarget('user', userId),
      followRepository.findTargetIdsByFollower(userId, 'user').then((ids) => ids.length),
      followRepository.findTargetIdsByFollower(userId, 'coin').then((ids) => ids.length),
    ]);

    return {
      userId,
      followersCount,
      followingUsersCount,
      followingCoinsCount,
    };
  },

  getCoinFollowStats: async (coinId: string) => {
    const coin = await coinRepository.findById(coinId);
    if (!coin) {
      throw new Error('Coin not found');
    }

    const followersCount = await followRepository.countByTarget('coin', coinId);
    return { coinId, followersCount };
  },

  isFollowingCoin: async (userId: string, coinId: string): Promise<boolean> => {
    return followRepository.exists(userId, 'coin', coinId);
  },

  syncLegacyFollowingCoins: async (userId: string): Promise<void> => {
    const coinIds = await followRepository.findTargetIdsByFollower(userId, 'coin');
    const user = await userRepository.findById(userId);
    if (!user) return;
    user.followingCoins = coinIds;
    await user.save();
  },
};
