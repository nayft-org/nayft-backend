import { Follow, FollowTargetType, IFollow } from './model';

export const followRepository = {
  create: async (
    followerId: string,
    targetType: FollowTargetType,
    targetId: string
  ): Promise<IFollow> => {
    return Follow.create({ followerId, targetType, targetId });
  },

  delete: async (
    followerId: string,
    targetType: FollowTargetType,
    targetId: string
  ): Promise<boolean> => {
    const result = await Follow.deleteOne({ followerId, targetType, targetId });
    return result.deletedCount > 0;
  },

  exists: async (
    followerId: string,
    targetType: FollowTargetType,
    targetId: string
  ): Promise<boolean> => {
    return !!(await Follow.exists({ followerId, targetType, targetId }));
  },

  upsert: async (
    followerId: string,
    targetType: FollowTargetType,
    targetId: string
  ): Promise<void> => {
    await Follow.updateOne(
      { followerId, targetType, targetId },
      { $setOnInsert: { followerId, targetType, targetId } },
      { upsert: true }
    );
  },

  findTargetIdsByFollower: async (
    followerId: string,
    targetType: FollowTargetType
  ): Promise<string[]> => {
    const docs = await Follow.find({ followerId, targetType }).select('targetId').lean<IFollow[]>();
    return docs.map((doc) => doc.targetId);
  },

  countByTarget: async (targetType: FollowTargetType, targetId: string): Promise<number> => {
    return Follow.countDocuments({ targetType, targetId });
  },

  findFollowers: async (
    targetType: FollowTargetType,
    targetId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<Array<{ followerId: string; createdAt: Date }>> => {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const skip = (safePage - 1) * safeLimit;
    const docs = await Follow.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select('followerId createdAt')
      .lean<IFollow[]>();

    return docs.map((doc) => ({ followerId: doc.followerId, createdAt: doc.createdAt }));
  },
};
