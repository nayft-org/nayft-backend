import { User } from './model';
import { IUser } from '../../types';
import { tokenize, buildTokenAndMatch } from '../search/queryTokens';

export const userRepository = {
  findById: async (id: string): Promise<IUser | null> => {
    return User.findById(id);
  },

  searchByUsername: async (query: string, limit: number = 5) => {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    return User.find(buildTokenAndMatch(['username'], tokens))
      .select('_id username')
      .limit(limit)
      .maxTimeMS(200)
      .lean();
  },

  getPreferredLanguage: async (userId: string): Promise<string | null> => {
    const doc = await User.findById(userId).select('preferredLanguage').lean();
    if (!doc) return null;
    const raw = (doc as { preferredLanguage?: string | null }).preferredLanguage;
    return raw === undefined || raw === null ? null : raw;
  },

  setPreferredLanguage: async (userId: string, language: string): Promise<IUser> => {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { preferredLanguage: language } },
      { new: true }
    );
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  },

  setCoinOnboardingCompleted: async (userId: string, completed: boolean): Promise<IUser> => {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { coinOnboardingCompleted: completed } },
      { new: true }
    ).select('-passwordHash');
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  },

  setPersonalizationEnabled: async (userId: string, enabled: boolean): Promise<IUser> => {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { personalizationEnabled: enabled } },
      { new: true }
    ).select('-passwordHash');
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  },

  getPersonalizationEnabled: async (userId: string): Promise<boolean> => {
    const doc = await User.findById(userId).select('personalizationEnabled').lean();
    if (!doc) return true;
    return (doc as { personalizationEnabled?: boolean }).personalizationEnabled !== false;
  },

  deleteById: async (userId: string): Promise<boolean> => {
    const result = await User.deleteOne({ _id: userId });
    return result.deletedCount > 0;
  },

  updateFollowingCoins: async (userId: string, coinId: string, add: boolean): Promise<IUser> => {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (add) {
      if (!user.followingCoins.includes(coinId)) {
        user.followingCoins.push(coinId);
      }
    } else {
      user.followingCoins = user.followingCoins.filter((id) => id !== coinId);
    }

    return user.save();
  },
};

