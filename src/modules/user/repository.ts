import { User } from './model';
import { IUser } from '../../types';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const userRepository = {
  findById: async (id: string): Promise<IUser | null> => {
    return User.findById(id);
  },

  searchByUsername: async (prefix: string, limit: number = 5) => {
    return User.find({
      username: { $regex: `^${escapeRegex(prefix)}`, $options: 'i' },
    })
      .select('_id username')
      .limit(limit)
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

