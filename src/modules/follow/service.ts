import { ICoin } from '../../types';
import { authRepository } from '../auth/repository';
import { coinRepository } from '../coin/repository';
import { userRepository } from '../user/repository';
import { followRepository } from './repository';
import { publishNewFollower } from '../../core/event-system/notificationEventBridge';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const clampPagination = (page?: number, limit?: number): { page: number; limit: number } => ({
  page: Math.max(1, page || 1),
  limit: Math.max(1, Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)),
});

/**
 * Normalize route/query coin keys the same way clients use `/coins/:coinId`
 * (canonical id, symbol, or internalCoinId). Returns null if no Mongo coin row exists.
 */
async function lookupStoredCoin(coinKey: string): Promise<ICoin | null> {
  const raw = coinKey.includes('=') ? coinKey.split('=')[1] : coinKey;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let coin = await coinRepository.findById(trimmed);
  if (!coin) {
    coin = await coinRepository.findBySymbol(trimmed);
  }
  if (!coin) {
    coin = await coinRepository.findByInternalId(trimmed);
  }
  return coin;
}

async function requireStoredCoin(coinKey: string): Promise<ICoin> {
  const coin = await lookupStoredCoin(coinKey);
  if (!coin) {
    throw new Error('Coin not found');
  }
  return coin;
}

async function mapUsersById(ids: string[]): Promise<Map<string, { username: string }>> {
  if (ids.length === 0) return new Map();
  const users = await authRepository.findByIds(ids);
  return new Map(
    users.map((user) => [String(user._id), { username: user.username }])
  );
}

export const followService = {
  followCoin: async (followerId: string, coinId: string) => {
    const coin = await requireStoredCoin(coinId);
    const canonicalId = coin.coinId;

    const alreadyFollowing = await followRepository.exists(followerId, 'coin', canonicalId);
    if (!alreadyFollowing) {
      await followRepository.upsert(followerId, 'coin', canonicalId);
    }

    const followersCount = await followRepository.countByTarget('coin', canonicalId);
    return { followed: true, targetType: 'coin', targetId: canonicalId, followersCount };
  },

  unfollowCoin: async (followerId: string, coinId: string) => {
    const coin = await lookupStoredCoin(coinId);
    const trimmed = (coinId.includes('=') ? coinId.split('=')[1] : coinId).trim();

    const idsToClear = new Set<string>();
    if (coin?.coinId) idsToClear.add(coin.coinId);
    if (trimmed) idsToClear.add(trimmed);

    for (const id of idsToClear) {
      await followRepository.delete(followerId, 'coin', id);
    }

    const primaryId = coin?.coinId ?? trimmed;
    const followersCount = await followRepository.countByTarget('coin', primaryId);
    return { followed: false, targetType: 'coin', targetId: primaryId, followersCount };
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
      void publishNewFollower({ targetUserId, followerId }).catch(() => {});
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
    if (userIds.length === 0) return [];

    const [usersById, followerCounts] = await Promise.all([
      mapUsersById(userIds),
      followRepository.countByTargets('user', userIds),
    ]);

    return userIds
      .map((id) => {
        const user = usersById.get(id);
        if (!user) return null;
        return {
          id,
          username: user.username,
          followersCount: followerCounts.get(id) || 0,
        };
      })
      .filter((user): user is NonNullable<typeof user> => user !== null);
  },

  getUserFollowers: async (targetUserId: string, page?: number, limit?: number) => {
    const { page: safePage, limit: safeLimit } = clampPagination(page, limit);
    const rows = await followRepository.findFollowers('user', targetUserId, safePage, safeLimit);
    const usersById = await mapUsersById(rows.map((row) => row.followerId));

    return rows
      .map((row) => {
        const user = usersById.get(row.followerId);
        if (!user) return null;
        return {
          id: row.followerId,
          username: user.username,
          followedAt: row.createdAt,
        };
      })
      .filter((follower): follower is NonNullable<typeof follower> => follower !== null);
  },

  getCoinFollowers: async (coinId: string, page?: number, limit?: number) => {
    const coin = await requireStoredCoin(coinId);
    const canonicalId = coin.coinId;

    const { page: safePage, limit: safeLimit } = clampPagination(page, limit);
    const rows = await followRepository.findFollowers('coin', canonicalId, safePage, safeLimit);
    const usersById = await mapUsersById(rows.map((row) => row.followerId));

    return rows
      .map((row) => {
        const user = usersById.get(row.followerId);
        if (!user) return null;
        return {
          id: row.followerId,
          username: user.username,
          followedAt: row.createdAt,
        };
      })
      .filter((follower): follower is NonNullable<typeof follower> => follower !== null);
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
    const coin = await lookupStoredCoin(coinId);
    if (!coin) {
      const trimmed = (coinId.includes('=') ? coinId.split('=')[1] : coinId).trim();
      return { coinId: trimmed || coinId, followersCount: 0 };
    }

    const canonicalId = coin.coinId;
    const followersCount = await followRepository.countByTarget('coin', canonicalId);
    return { coinId: canonicalId, followersCount };
  },

  isFollowingCoin: async (userId: string, coinId: string): Promise<boolean> => {
    const coin = await lookupStoredCoin(coinId);
    if (coin) {
      return followRepository.exists(userId, 'coin', coin.coinId);
    }
    const trimmed = (coinId.includes('=') ? coinId.split('=')[1] : coinId).trim();
    return followRepository.exists(userId, 'coin', trimmed);
  },

  syncLegacyFollowingCoins: async (userId: string): Promise<void> => {
    const coinIds = await followRepository.findTargetIdsByFollower(userId, 'coin');
    const user = await userRepository.findById(userId);
    if (!user) return;
    user.followingCoins = coinIds;
    await user.save();
  },
};
