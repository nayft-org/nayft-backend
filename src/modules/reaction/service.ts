import { reactionRepository } from './repository';
import { ReactionType, REACTION_TYPES } from './model';
import { NewsArticle } from '../news/models/NewsArticle';
import { RewardsActivity } from '../rewards/model';
import { User } from '../user/model';

export interface ReactionCounts {
  appreciate: number;
  insightful: number;
  bullish: number;
  risk: number;
  deepDive: number;
  debatable: number;
  total: number;
}

function emptyReactionCounts(): ReactionCounts {
  return {
    appreciate: 0,
    insightful: 0,
    bullish: 0,
    risk: 0,
    deepDive: 0,
    debatable: 0,
    total: 0,
  };
}

const REACTION_REWARD_POINTS = 1;

export const reactionService = {
  toggleReaction: async (
    userId: string,
    newsId: string,
    type: ReactionType
  ): Promise<{ userReaction: ReactionType | null; reactions: ReactionCounts }> => {
    if (!REACTION_TYPES.includes(type)) {
      throw new Error(`Invalid reaction type: ${type}`);
    }

    const existing = await reactionRepository.findByUserAndTarget(userId, 'news', newsId);

    if (!existing) {
      await reactionRepository.create({
        userId,
        targetType: 'news',
        targetId: newsId,
        type,
      });
      await NewsArticle.updateOne(
        { externalId: newsId },
        {
          $inc: {
            [`metrics.reactions.${type}`]: 1,
            'metrics.reactions.total': 1,
            'metrics.likes': 1,
          },
        }
      );

      await RewardsActivity.create({
        userId,
        action: `reaction_${type}`,
        points: REACTION_REWARD_POINTS,
      });
      await User.findByIdAndUpdate(userId, {
        $inc: { rewardPoints: REACTION_REWARD_POINTS },
      });

      const reactions = await getReactionCounts(newsId);
      return { userReaction: type, reactions };
    }

    if (existing.type === type) {
      await reactionRepository.deleteByUserAndTarget(userId, 'news', newsId);
      await NewsArticle.updateOne(
        { externalId: newsId },
        {
          $inc: {
            [`metrics.reactions.${type}`]: -1,
            'metrics.reactions.total': -1,
            'metrics.likes': -1,
          },
        }
      );
      const reactions = await getReactionCounts(newsId);
      return { userReaction: null, reactions };
    }

    const oldType = existing.type;
    await reactionRepository.updateType(userId, 'news', newsId, type);
    await NewsArticle.updateOne(
      { externalId: newsId },
      {
        $inc: {
          [`metrics.reactions.${oldType}`]: -1,
          [`metrics.reactions.${type}`]: 1,
        },
      }
    );

    const reactions = await getReactionCounts(newsId);
    return { userReaction: type, reactions };
  },

  removeReaction: async (
    userId: string,
    newsId: string
  ): Promise<{ userReaction: null; reactions: ReactionCounts }> => {
    const existing = await reactionRepository.deleteByUserAndTarget(userId, 'news', newsId);
    if (existing) {
      await NewsArticle.updateOne(
        { externalId: newsId },
        {
          $inc: {
            [`metrics.reactions.${existing.type}`]: -1,
            'metrics.reactions.total': -1,
            'metrics.likes': -1,
          },
        }
      );
    }
    const reactions = await getReactionCounts(newsId);
    return { userReaction: null, reactions };
  },

  getReactions: async (
    newsId: string,
    userId?: string
  ): Promise<{ userReaction: ReactionType | null; reactions: ReactionCounts }> => {
    const reactions = await getReactionCounts(newsId);
    let userReaction: ReactionType | null = null;
    if (userId) {
      const existing = await reactionRepository.findByUserAndTarget(userId, 'news', newsId);
      if (existing) userReaction = existing.type;
    }
    return { userReaction, reactions };
  },

  getReactionUsers: async (
    newsId: string,
    type: ReactionType,
    page: number = 1,
    limit: number = 20
  ) => {
    const reactions = await reactionRepository.findByTarget('news', newsId, type, page, limit);
    const userIds = reactions.map((r) => r.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id username')
      .lean();
    const userMap = new Map(users.map((u: any) => [u._id.toString(), u.username]));
    return reactions.map((r) => ({
      userId: r.userId,
      username: userMap.get(r.userId) || 'Unknown',
      reactedAt: r.createdAt,
    }));
  },

  getUserReactionsForArticles: async (
    userId: string,
    newsIds: string[]
  ): Promise<Record<string, ReactionType>> => {
    const reactions = await reactionRepository.findByUserAndTargets(userId, 'news', newsIds);
    const map: Record<string, ReactionType> = {};
    for (const r of reactions) {
      map[r.targetId] = r.type;
    }
    return map;
  },
};

async function getReactionCounts(newsId: string): Promise<ReactionCounts> {
  const article = await NewsArticle.findOne({ externalId: newsId })
    .select('metrics.reactions')
    .lean();
  if (!article?.metrics?.reactions) return emptyReactionCounts();
  const r = article.metrics.reactions as any;
  return {
    appreciate: r.appreciate || 0,
    insightful: r.insightful || 0,
    bullish: r.bullish || 0,
    risk: r.risk || 0,
    deepDive: r.deepDive || 0,
    debatable: r.debatable || 0,
    total: r.total || 0,
  };
}
