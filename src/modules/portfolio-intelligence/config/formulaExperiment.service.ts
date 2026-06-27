import { createHash } from 'crypto';
import { redis } from '../../../config/redis';
import { getActiveFormulaBundle, type PiFormulaBundle } from './piFormulaRegistry';

export type ExperimentVariant = 'control' | 'treatment';

export const formulaExperimentService = {
  async assignVariant(userId: string, experimentId: string, trafficPct = 50): Promise<ExperimentVariant> {
    const cacheKey = `pi:experiment:${experimentId}:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached === 'control' || cached === 'treatment') return cached;

    const hash = createHash('sha256').update(`${userId}:${experimentId}`).digest();
    const bucket = hash[0] % 100;
    const variant: ExperimentVariant = bucket < trafficPct ? 'treatment' : 'control';
    await redis.setex(cacheKey, 86400, variant);
    return variant;
  },

  async resolveBundle(userId: string): Promise<PiFormulaBundle> {
    const base = getActiveFormulaBundle();
    const variant = await this.assignVariant(userId, 'default_formula_ab', 0);
    if (variant === 'treatment' && process.env.PI_FORMULA_TREATMENT_PIN) {
      return { ...base, insights: process.env.PI_FORMULA_TREATMENT_PIN };
    }
    return base;
  },

  listVersions(): Array<{ bundleId: string; engines: PiFormulaBundle }> {
    const active = getActiveFormulaBundle();
    return [{ bundleId: 'active', engines: active }];
  },
};
