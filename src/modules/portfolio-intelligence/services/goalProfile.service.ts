import * as fs from 'fs';
import * as path from 'path';
import { redis, cacheHelpers } from '../../../config/redis';

export type GoalProfileId =
  | 'capital_preservation'
  | 'balanced_growth'
  | 'aggressive_growth'
  | 'yield_generation'
  | 'narrative_investing';

export type GoalProfileDefinition = {
  name: string;
  targetBands: Record<string, { min: number; max: number }>;
  healthWeights: Record<string, number>;
};

type GoalProfilesCatalog = {
  version: string;
  profiles: Record<GoalProfileId, GoalProfileDefinition>;
  defaultProfileId: GoalProfileId;
};

const GOAL_KEY = (userId: string) => `pi:goal:${userId}`;

function loadCatalog(): GoalProfilesCatalog {
  const full = path.join(__dirname, '../formulas/v1/goal_profiles_v1.json');
  return JSON.parse(fs.readFileSync(full, 'utf8')) as GoalProfilesCatalog;
}

export const goalProfileService = {
  getCatalog(): GoalProfilesCatalog {
    return loadCatalog();
  },

  getDefinition(profileId: GoalProfileId): GoalProfileDefinition {
    const catalog = loadCatalog();
    return catalog.profiles[profileId] ?? catalog.profiles[catalog.defaultProfileId];
  },

  async getGoalProfile(userId: string): Promise<{
    goalProfileId: GoalProfileId;
    setAt: string;
    source: 'onboarding' | 'settings' | 'inferred';
    definition: GoalProfileDefinition;
  }> {
    const cached = await cacheHelpers.get<{
      goalProfileId: GoalProfileId;
      setAt: string;
      source: 'onboarding' | 'settings' | 'inferred';
    }>(GOAL_KEY(userId));

    const catalog = loadCatalog();
    const goalProfileId = cached?.goalProfileId ?? catalog.defaultProfileId;
    return {
      goalProfileId,
      setAt: cached?.setAt ?? new Date(0).toISOString(),
      source: cached?.source ?? 'onboarding',
      definition: catalog.profiles[goalProfileId],
    };
  },

  async setGoalProfile(
    userId: string,
    goalProfileId: GoalProfileId,
    source: 'onboarding' | 'settings' | 'inferred' = 'settings'
  ): Promise<void> {
    const catalog = loadCatalog();
    if (!catalog.profiles[goalProfileId]) {
      throw new Error(`Unknown goal profile: ${goalProfileId}`);
    }
    await cacheHelpers.set(
      GOAL_KEY(userId),
      { goalProfileId, setAt: new Date().toISOString(), source },
      86400 * 30
    );
    await redis.set(GOAL_KEY(userId), JSON.stringify({ goalProfileId, setAt: new Date().toISOString(), source }));
  },
};
