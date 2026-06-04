import { redis } from '../../../config/redis';
import { piRedisKeys } from '../cache/piRedisKeys';
import { CoinCategoryMapping } from '../models/CoinCategoryMapping';
import { CoinCategoryOverride } from '../models/CoinCategoryOverride';
import { cacheHelpers } from '../../../config/redis';
import { piConfig } from '../config/piConfig';

export const categoryMappingService = {
  async getCatalogVersion(): Promise<number> {
    const v = await redis.get(piRedisKeys.globalRevision);
    return parseInt(v || '1', 10) || 1;
  },

  async getCategoriesForCoin(internalCoinId: string): Promise<{
    primaryCategoryId: string | null;
    secondaryCategoryIds: string[];
    confidence: number;
  }> {
    const catalogVersion = await this.getCatalogVersion();
    const cacheKey = piRedisKeys.coinCategories(internalCoinId, catalogVersion);
    const hit = await cacheHelpers.get<{
      primaryCategoryId: string;
      secondaryCategoryIds: string[];
      confidence: number;
    }>(cacheKey);
    if (hit) return hit;

    const override = await CoinCategoryOverride.findOne({ internalCoinId }).lean();
    if (override) {
      const result = {
        primaryCategoryId: override.primaryCategoryId,
        secondaryCategoryIds: override.secondaryCategoryIds ?? [],
        confidence: 1,
      };
      await cacheHelpers.set(cacheKey, result, piConfig.coinCategoriesTtlSec);
      return result;
    }

    const mapping = await CoinCategoryMapping.findOne({
      internalCoinId,
      catalogVersion,
    }).lean();

    const result = {
      primaryCategoryId: mapping?.primaryCategoryId ?? null,
      secondaryCategoryIds: mapping?.secondaryCategoryIds ?? [],
      confidence: mapping?.confidence ?? 0,
    };
    if (mapping) {
      await cacheHelpers.set(cacheKey, result, piConfig.coinCategoriesTtlSec);
    }
    return result;
  },
};
