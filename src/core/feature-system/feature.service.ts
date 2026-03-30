import { Feature } from './feature.model';
import { FeatureAuditLog } from './featureAudit.model';
import type { PatchFeatureInput } from './feature.schema';
import { cacheHelpers } from '../../config/redis';

const FEATURE_CACHE_TTL = 45;
const FEATURE_CACHE_PREFIX = 'feature:';

export interface FeatureFilter {
  module?: string;
  isActive?: boolean;
  category?: 'free' | 'premium' | 'enterprise';
}

export interface UserContext {
  userId?: string;
  segment?: string;
}

function invalidateFeatureCache(key: string): void {
  cacheHelpers.del(FEATURE_CACHE_PREFIX + key).catch(() => {});
}

export const featureService = {
  async getAll(filters?: FeatureFilter) {
    const query: Record<string, unknown> = {};
    if (filters?.module) query.module = filters.module;
    if (filters?.isActive !== undefined) query.isActive = filters.isActive;
    if (filters?.category) query.category = filters.category;

    return Feature.find(query).sort({ module: 1, key: 1 }).lean().exec();
  },

  async getByKey(key: string) {
    const cached = await cacheHelpers.get<Record<string, unknown>>(FEATURE_CACHE_PREFIX + key);
    if (cached) return cached;
    const f = await Feature.findOne({ key }).lean().exec();
    if (f) {
      await cacheHelpers.set(FEATURE_CACHE_PREFIX + key, f, FEATURE_CACHE_TTL);
    }
    return f;
  },

  async isActive(key: string): Promise<boolean> {
    const f = await this.getByKey(key);
    return (f as { isActive?: boolean })?.isActive ?? false;
  },

  async updateSafeFields(
    key: string,
    updates: PatchFeatureInput,
    updatedBy?: string
  ) {
    const feature = await Feature.findOne({ key }).lean().exec();
    if (!feature) throw new Error(`Feature not found: ${key}`);

    if (updates.isActive !== undefined) {
      if (!feature.controllable) {
        throw new Error(`Feature ${key} is not controllable`);
      }
    }

    const updateDoc: Record<string, unknown> = {
      updatedAt: new Date(),
      ...(updatedBy && { updatedBy }),
    };
    if (updates.name !== undefined) updateDoc.name = updates.name;
    if (updates.description !== undefined) updateDoc.description = updates.description;
    if (updates.isActive !== undefined) updateDoc.isActive = updates.isActive;

    const updated = await Feature.findOneAndUpdate(
      { key, ...(updates.isActive !== undefined && { updatedAt: feature.updatedAt }) },
      { $set: updateDoc },
      { new: true }
    )
      .lean()
      .exec();

    if (!updated) {
      throw new Error(`Conflict: feature was modified concurrently`);
    }
    invalidateFeatureCache(key);

    const auditData: Record<string, unknown>[] = [];
    if (updates.isActive !== undefined) {
      auditData.push({
        featureKey: key,
        action: 'toggle',
        oldValue: { isActive: feature.isActive },
        newValue: { isActive: updates.isActive },
        userId: updatedBy,
        timestamp: new Date(),
      });
    }
    if (updates.name !== undefined || updates.description !== undefined) {
      const oldVal: Record<string, unknown> = {};
      const newVal: Record<string, unknown> = {};
      if (updates.name !== undefined) {
        oldVal.name = feature.name;
        newVal.name = updates.name;
      }
      if (updates.description !== undefined) {
        oldVal.description = feature.description;
        newVal.description = updates.description;
      }
      auditData.push({
        featureKey: key,
        action: 'metadata_edit',
        oldValue: oldVal,
        newValue: newVal,
        userId: updatedBy,
        timestamp: new Date(),
      });
    }
    if (auditData.length > 0) {
      await FeatureAuditLog.insertMany(auditData);
    }

    return updated;
  },

  async isEnabled(
    featureKey: string,
    context?: UserContext
  ): Promise<boolean> {
    const CRITICAL_KEYS = ['auth', 'system'];
    const feature = await this.getByKey(featureKey) as {
      isActive?: boolean;
      critical?: boolean;
      allowedUsers?: string[];
      segments?: string[];
      rolloutPercentage?: number;
    } | null;

    if (!feature) {
      if (CRITICAL_KEYS.includes(featureKey)) {
        throw new Error('Critical feature disabled or missing');
      }
      return false;
    }

    if (feature.critical && !feature.isActive) {
      throw new Error('Critical feature disabled or missing');
    }

    if (feature.allowedUsers?.length) {
      return !!(context?.userId && feature.allowedUsers.includes(context.userId));
    }
    if (feature.segments?.length) {
      return !!(context?.segment && feature.segments.includes(context.segment));
    }
    if (feature.rolloutPercentage != null && feature.rolloutPercentage > 0) {
      const id = context?.userId || 'anonymous';
      const hash = simpleHash(id);
      const bucket = hash % 100;
      return bucket < feature.rolloutPercentage;
    }

    return !!feature.isActive;
  },
};

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
