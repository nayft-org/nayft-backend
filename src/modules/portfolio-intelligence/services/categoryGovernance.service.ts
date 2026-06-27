import { CategoryMappingAudit } from '../models/CategoryMappingAudit';
import { CategoryGovernanceReview } from '../models/CategoryGovernanceReview';
import { CoinCategoryOverride } from '../models/CoinCategoryOverride';
import { PiCatalogSnapshot } from '../models/PiCatalogSnapshot';

export type AuditRecord = {
  internalCoinId: string;
  issue: string;
  catalogVersion: number;
  details?: Record<string, unknown>;
};

export const categoryGovernanceService = {
  async recordAudit(record: AuditRecord): Promise<void> {
    await CategoryMappingAudit.create({
      internalCoinId: record.internalCoinId,
      issue: record.issue,
      catalogVersion: record.catalogVersion,
      details: record.details ?? {},
    });
  },

  async flagForReview(params: {
    internalCoinId: string;
    catalogVersion: number;
    conflictType: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await CategoryGovernanceReview.findOneAndUpdate(
      { internalCoinId: params.internalCoinId, catalogVersion: params.catalogVersion, status: 'pending' },
      {
        $setOnInsert: { firstSeenAt: new Date() },
        $set: {
          conflictType: params.conflictType,
          details: params.details ?? {},
          status: 'pending',
        },
      },
      { upsert: true }
    );
    await this.recordAudit({
      internalCoinId: params.internalCoinId,
      issue: `conflict:${params.conflictType}`,
      catalogVersion: params.catalogVersion,
      details: params.details,
    });
  },

  async listCatalogVersions(limit = 20) {
    return PiCatalogSnapshot.find({}).sort({ catalogVersion: -1 }).limit(limit).lean();
  },

  async listReviews(status = 'pending', limit = 50) {
    return CategoryGovernanceReview.find({ status }).sort({ createdAt: -1 }).limit(limit).lean();
  },

  async updateReview(
    id: string,
    update: { status: 'approved' | 'rejected' | 'deferred'; resolution?: string; reviewedBy?: string }
  ) {
    return CategoryGovernanceReview.findByIdAndUpdate(
      id,
      { $set: { ...update, reviewedAt: new Date() } },
      { new: true }
    ).lean();
  },

  async createOverride(params: {
    internalCoinId: string;
    primaryCategoryId: string;
    secondaryCategoryIds?: string[];
    reason: string;
    updatedBy: string;
    catalogVersion: number;
  }) {
    const doc = await CoinCategoryOverride.findOneAndUpdate(
      { internalCoinId: params.internalCoinId },
      {
        $set: {
          primaryCategoryId: params.primaryCategoryId,
          secondaryCategoryIds: params.secondaryCategoryIds ?? [],
          reason: params.reason,
          updatedBy: params.updatedBy,
          catalogVersion: params.catalogVersion,
        },
      },
      { upsert: true, new: true }
    ).lean();
    await this.recordAudit({
      internalCoinId: params.internalCoinId,
      issue: 'override_created',
      catalogVersion: params.catalogVersion,
      details: { primaryCategoryId: params.primaryCategoryId, reason: params.reason },
    });
    return doc;
  },

  async deleteOverride(internalCoinId: string, catalogVersion: number) {
    await CoinCategoryOverride.deleteOne({ internalCoinId });
    await this.recordAudit({
      internalCoinId,
      issue: 'override_removed',
      catalogVersion,
      details: {},
    });
  },

  async listAudit(internalCoinId?: string, limit = 100) {
    const filter = internalCoinId ? { internalCoinId } : {};
    return CategoryMappingAudit.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  },
};
