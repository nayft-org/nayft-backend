import { ICoin } from '../../types';
import { authRepository } from '../auth/repository';
import { coinRepository } from '../coin/repository';
import { labeledActiveCoinRepository } from '../coin/labeledActiveCoinRepository';
import { userRepository } from '../user/repository';
import { followRepository } from './repository';
import { publishNewFollower } from '../../core/event-system/notificationEventBridge';
import { resolveBatchFromSnapshots } from '../coin/coinSnapshotResolve';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const clampPagination = (page?: number, limit?: number): { page: number; limit: number } => ({
  page: Math.max(1, page || 1),
  limit: Math.max(1, Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT)),
});

/**
 * Normalize route/query coin keys the same way clients use `/coins/:coinId`
 * (canonical id, symbol, or internalCoinId). Falls back to labeled active coins
 * (same source as Explore / onboarding picker) when the Coin collection has no row.
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
  if (coin) return coin;

  const labeled = await labeledActiveCoinRepository.findByCoinId(trimmed);
  if (!labeled) return null;

  coin = await coinRepository.findById(labeled.id);
  if (!coin && labeled.internalCoinId) {
    coin = await coinRepository.findByInternalId(labeled.internalCoinId);
  }
  if (!coin && labeled.symbol) {
    coin = await coinRepository.findBySymbol(labeled.symbol);
  }
  if (coin) return coin;

  return {
    coinId: labeled.id,
    symbol: (labeled.symbol ?? trimmed).toUpperCase(),
    name: labeled.name ?? labeled.id,
  } as ICoin;
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

    const [dbCoins, followerCountsMap] = await Promise.all([
      coinRepository.findByIds(coinIds),
      followRepository.countByTargets('coin', coinIds),
    ]);

    const byCoinId = new Map(dbCoins.map((coin) => [coin.coinId, coin]));
    const results: Array<{
      coinId: string;
      symbol: string;
      name: string;
      rank: number;
      price: number;
      percentChange24h: number;
      followersCount: number;
    }> = [];

    for (const targetId of coinIds) {
      const coin = byCoinId.get(targetId);
      if (coin) {
        results.push({
          coinId: coin.coinId,
          symbol: coin.symbol,
          name: coin.name,
          rank: coin.rank,
          price: coin.price,
          percentChange24h: coin.percentChange24h,
          followersCount: followerCountsMap.get(coin.coinId) || 0,
        });
        continue;
      }

      const labeled = await labeledActiveCoinRepository.findByCoinId(targetId);
      if (labeled) {
        results.push({
          coinId: labeled.id,
          symbol: labeled.symbol ?? targetId,
          name: labeled.name ?? labeled.id,
          rank: labeled.market_cap_rank ?? 0,
          price: labeled.current_price ?? 0,
          percentChange24h: labeled.price_change_percentage_24h ?? 0,
          followersCount: followerCountsMap.get(targetId) || 0,
        });
      }
    }

    if (results.length === 0) return [];

    const snapshotRows = await resolveBatchFromSnapshots(
      results.flatMap((r) => [r.coinId, r.symbol])
    );
    const byCoinIdSnap = new Map(snapshotRows.map((r) => [r.coinId.toLowerCase(), r]));
    const bySymbolSnap = new Map(snapshotRows.map((r) => [r.symbol.toLowerCase(), r]));

    return results.map((row) => {
      const snap =
        byCoinIdSnap.get(row.coinId.toLowerCase()) ??
        bySymbolSnap.get(row.symbol.toLowerCase());
      return {
        ...row,
        coinId: snap?.coinId ?? row.coinId,
        symbol: snap?.symbol ?? row.symbol,
        name: snap?.name ?? row.name,
        rank: snap?.marketCapRank ?? row.rank,
        price: snap?.price ?? row.price,
        percentChange24h: snap?.percentChange24h ?? row.percentChange24h,
        image: snap?.image,
        marketCapRank: snap?.marketCapRank,
      };
    });
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
