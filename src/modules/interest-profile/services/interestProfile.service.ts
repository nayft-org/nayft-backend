import { cacheHelpers } from '../../../config/redis';
import { UserInterestProfile } from '../models/UserInterestProfile';
import { portfolioIntelligenceFacade } from '../../portfolio-intelligence/services/portfolioIntelligenceFacade.service';
import { Follow } from '../../follow/model';

const CACHE_TTL = 300;
const MAX_SIGNAL_IDS = 100;
const cacheKey = (userId: string) => `interest:profile:${userId}`;

function mergeUniqueIds(existing: string[] = [], incoming: string[] = [], max = MAX_SIGNAL_IDS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...incoming, ...existing]) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export type InterestProfileSignalsInput = {
  readArticleIds?: string[];
  savedArticleIds?: string[];
  searchedSymbols?: string[];
  dwellTimeBuckets?: Record<string, number>;
};

export const interestProfileService = {
  async syncSignals(userId: string, input: InterestProfileSignalsInput): Promise<{ revision: number }> {
    const existing = await UserInterestProfile.findOne({ userId }).lean();
    const prevSignals = existing?.signals ?? {
      followedCoins: [],
      savedArticleIds: [],
      readArticleIds: [],
      searchedSymbols: [],
      reactionCounts: {},
      dwellTimeBuckets: {},
    };

    const readArticleIds = input.readArticleIds
      ? mergeUniqueIds(prevSignals.readArticleIds, input.readArticleIds)
      : prevSignals.readArticleIds;
    const savedArticleIds = input.savedArticleIds
      ? mergeUniqueIds(prevSignals.savedArticleIds, input.savedArticleIds)
      : prevSignals.savedArticleIds;
    const searchedSymbols = input.searchedSymbols
      ? mergeUniqueIds(
          prevSignals.searchedSymbols,
          input.searchedSymbols.map((s) => s.toUpperCase())
        )
      : prevSignals.searchedSymbols;

    const dwellTimeBuckets = { ...prevSignals.dwellTimeBuckets };
    if (input.dwellTimeBuckets) {
      for (const [bucket, count] of Object.entries(input.dwellTimeBuckets)) {
        dwellTimeBuckets[bucket] = (dwellTimeBuckets[bucket] ?? 0) + count;
      }
    }

    const revision = (existing?.revision ?? 0) + 1;
    await UserInterestProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          computedAt: new Date(),
          revision,
          signals: {
            ...prevSignals,
            readArticleIds,
            savedArticleIds,
            searchedSymbols,
            dwellTimeBuckets,
          },
          stale: true,
        },
      },
      { upsert: true }
    );
    await cacheHelpers.del(cacheKey(userId));
    return { revision };
  },
  async getProfile(userId: string) {
    const cached = await cacheHelpers.get<Record<string, unknown>>(cacheKey(userId));
    if (cached) return cached;

    const doc = await UserInterestProfile.findOne({ userId }).lean();
    if (doc) {
      const dto = {
        categoryAffinity: doc.categoryAffinity,
        coinAffinity: doc.coinAffinity,
        blendWeights: doc.blendWeights,
        revision: doc.revision,
        stale: doc.stale,
        computedAt: doc.computedAt.toISOString(),
      };
      await cacheHelpers.set(cacheKey(userId), dto, CACHE_TTL);
      return dto;
    }
    return null;
  },

  async recompute(userId: string): Promise<number> {
    const [feedIntel, follows] = await Promise.all([
      portfolioIntelligenceFacade.getFeedIntelligenceContext(userId),
      Follow.find({ followerId: userId, targetType: 'coin' }).select('targetId').lean(),
    ]);

    const categoryAffinity = feedIntel?.categoryAffinityFromPortfolio ?? {};
    const coinAffinity: Record<string, number> = {};
    for (const [sym, w] of Object.entries(feedIntel?.weightBySymbol ?? {})) {
      coinAffinity[sym] = w;
    }
    for (const f of follows) {
      if (f.targetId) coinAffinity[f.targetId] = Math.max(coinAffinity[f.targetId] ?? 0, 0.5);
    }

    const narrativeAffinity = feedIntel?.narrativeVector ?? {};

    const existing = await UserInterestProfile.findOne({ userId }).lean();
    const revision = (existing?.revision ?? 0) + 1;

    await UserInterestProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          computedAt: new Date(),
          revision,
          categoryAffinity,
          coinAffinity,
          narrativeAffinity,
          signals: {
            followedCoins: follows.map((f) => f.targetId).filter(Boolean),
            savedArticleIds: existing?.signals?.savedArticleIds ?? [],
            readArticleIds: existing?.signals?.readArticleIds ?? [],
            searchedSymbols: existing?.signals?.searchedSymbols ?? [],
            reactionCounts: existing?.signals?.reactionCounts ?? {},
            dwellTimeBuckets: existing?.signals?.dwellTimeBuckets ?? {},
          },
          stale: false,
        },
      },
      { upsert: true }
    );

    await cacheHelpers.del(cacheKey(userId));
    return revision;
  },
};
