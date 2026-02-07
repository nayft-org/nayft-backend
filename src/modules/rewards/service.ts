import { rewardsRepository } from './repository';

const REWARD_POINTS = {
  DAILY_LOGIN: 10,
  ADD_WISHLIST: 5,
  FOLLOW_COIN: 3,
  READ_NEWS: 2,
  CLAIM_REWARD: 0, // Points are already added
};

export const rewardsService = {
  getRewards: async (userId: string) => {
    const user = await rewardsRepository.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const activities = await rewardsRepository.findByUser(userId, 50);

    return {
      totalPoints: user.rewardPoints,
      activities: activities.map((activity) => ({
        id: activity._id.toString(),
        action: activity.action,
        points: activity.points,
        createdAt: activity.createdAt,
      })),
    };
  },

  claimReward: async (userId: string, action: string) => {
    const points = REWARD_POINTS[action as keyof typeof REWARD_POINTS] || 0;
    
    if (points === 0) {
      throw new Error('Invalid reward action');
    }

    // Check if already claimed today (for daily login)
    if (action === 'DAILY_LOGIN') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activities = await rewardsRepository.findByUser(userId, 1);
      const lastActivity = activities[0];
      
      if (lastActivity && lastActivity.action === 'DAILY_LOGIN' && lastActivity.createdAt >= today) {
        throw new Error('Daily login reward already claimed today');
      }
    }

    // Create activity and update points
    await rewardsRepository.create(userId, action, points);
    await rewardsRepository.updateUserPoints(userId, points);

    return {
      message: 'Reward claimed successfully',
      points,
    };
  },
};

