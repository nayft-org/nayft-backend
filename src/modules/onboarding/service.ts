import { IUser } from '../../types';
import { authRepository } from '../auth/repository';
import { followRepository } from '../follow/repository';
import { followService } from '../follow/service';
import { userRepository } from '../user/repository';

const MIN_COINS = 5;

export const onboardingService = {
  /**
   * Legacy users who already follow ≥5 coins skip the modal without client action.
   */
  ensureCoinOnboardingMigrated: async (user: IUser): Promise<IUser> => {
    if (user.coinOnboardingCompleted) {
      return user;
    }
    const userId = String(user._id);
    const coinIds = await followRepository.findTargetIdsByFollower(userId, 'coin');
    if (coinIds.length >= MIN_COINS) {
      return userRepository.setCoinOnboardingCompleted(userId, true);
    }
    return user;
  },

  completeCoinOnboarding: async (userId: string, coinIds: string[]): Promise<IUser> => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.coinOnboardingCompleted) {
      const sanitized = await authRepository.findById(userId);
      if (!sanitized) throw new Error('User not found');
      return sanitized;
    }

    const unique = [...new Set(coinIds.map((id) => String(id).trim()).filter(Boolean))];
    if (unique.length < MIN_COINS) {
      throw new Error(`Select at least ${MIN_COINS} coins`);
    }

    const canonicalIds = new Set<string>();
    for (const coinId of unique) {
      const result = await followService.followCoin(userId, coinId);
      canonicalIds.add(result.targetId);
    }

    if (canonicalIds.size < MIN_COINS) {
      throw new Error(`Select at least ${MIN_COINS} distinct coins`);
    }

    await followService.syncLegacyFollowingCoins(userId);

    return userRepository.setCoinOnboardingCompleted(userId, true);
  },
};
