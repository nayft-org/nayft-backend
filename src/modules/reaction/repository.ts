import { Reaction, IReaction, ReactionType, TargetType } from './model';

export const reactionRepository = {
  findByUserAndTarget: async (
    userId: string,
    targetType: TargetType,
    targetId: string
  ): Promise<IReaction | null> => {
    return Reaction.findOne({ userId, targetType, targetId });
  },

  findByUserAndTargets: async (
    userId: string,
    targetType: TargetType,
    targetIds: string[]
  ): Promise<IReaction[]> => {
    return Reaction.find({
      userId,
      targetType,
      targetId: { $in: targetIds },
    }).lean<IReaction[]>();
  },

  create: async (data: {
    userId: string;
    targetType: TargetType;
    targetId: string;
    type: ReactionType;
  }): Promise<IReaction> => {
    return Reaction.create(data);
  },

  updateType: async (
    userId: string,
    targetType: TargetType,
    targetId: string,
    type: ReactionType
  ): Promise<IReaction | null> => {
    return Reaction.findOneAndUpdate(
      { userId, targetType, targetId },
      { type },
      { new: true }
    );
  },

  deleteByUserAndTarget: async (
    userId: string,
    targetType: TargetType,
    targetId: string
  ): Promise<IReaction | null> => {
    return Reaction.findOneAndDelete({ userId, targetType, targetId });
  },

  findByTarget: async (
    targetType: TargetType,
    targetId: string,
    type?: ReactionType,
    page: number = 1,
    limit: number = 20
  ): Promise<IReaction[]> => {
    const filter: Record<string, unknown> = { targetType, targetId };
    if (type) filter.type = type;
    const skip = (page - 1) * limit;
    return Reaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<IReaction[]>();
  },

  countByTarget: async (
    targetType: TargetType,
    targetId: string
  ): Promise<Record<ReactionType, number>> => {
    const result = await Reaction.aggregate([
      { $match: { targetType, targetId } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    const counts = {
      appreciate: 0,
      insightful: 0,
      bullish: 0,
      risk: 0,
      deepDive: 0,
      debatable: 0,
    } as Record<ReactionType, number>;
    for (const r of result) {
      counts[r._id as ReactionType] = r.count;
    }
    return counts;
  },
};
