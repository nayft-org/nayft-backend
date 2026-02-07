import { RewardsActivity } from '../rewards/model';
import { User } from '../user/model';
import { IRewardsActivity, IUser } from '../../types';

export const rewardsRepository = {
  findByUser: async (userId: string, limit: number = 50): Promise<IRewardsActivity[]> => {
    return RewardsActivity.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  },

  create: async (userId: string, action: string, points: number): Promise<IRewardsActivity> => {
    const activity = new RewardsActivity({ userId, action, points });
    return activity.save();
  },

  getUser: async (userId: string): Promise<IUser | null> => {
    return User.findById(userId);
  },

  updateUserPoints: async (userId: string, points: number): Promise<void> => {
    await User.findByIdAndUpdate(userId, { $inc: { rewardPoints: points } });
  },
};

