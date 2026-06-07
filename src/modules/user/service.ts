import { userRepository } from './repository';
import { followService } from '../follow/service';
import { isSupportedLanguage } from './supportedLanguages';
import { authService } from '../auth/service';
import { accountDeletionService } from './accountDeletion.service';

export const userService = {
  getPreferences: async (userId: string): Promise<{ preferredLanguage: string | null; personalizationEnabled: boolean }> => {
    const preferredLanguage = await userRepository.getPreferredLanguage(userId);
    const personalizationEnabled = await userRepository.getPersonalizationEnabled(userId);
    return { preferredLanguage, personalizationEnabled };
  },

  updatePreferences: async (
    userId: string,
    patch: { preferredLanguage?: string; personalizationEnabled?: boolean }
  ): Promise<{ preferredLanguage?: string; personalizationEnabled?: boolean; token?: string }> => {
    const result: { preferredLanguage?: string; personalizationEnabled?: boolean; token?: string } = {};

    if (typeof patch.preferredLanguage === 'string' && patch.preferredLanguage.trim()) {
      if (!isSupportedLanguage(patch.preferredLanguage.trim())) {
        throw new Error('Unsupported language');
      }
      await userRepository.setPreferredLanguage(userId, patch.preferredLanguage.trim());
      result.preferredLanguage = patch.preferredLanguage.trim();
      result.token = await authService.issueAccessTokenForUser(userId);
    }

    if (typeof patch.personalizationEnabled === 'boolean') {
      await userRepository.setPersonalizationEnabled(userId, patch.personalizationEnabled);
      result.personalizationEnabled = patch.personalizationEnabled;
    }

    return result;
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

  deleteAccount: async (userId: string) => {
    return accountDeletionService.deleteAccount(userId);
  },
};

