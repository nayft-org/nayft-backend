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

