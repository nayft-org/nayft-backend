import mongoose, { Schema, Document } from 'mongoose';

export type GovernanceReviewStatus = 'pending' | 'approved' | 'rejected' | 'deferred';

export interface ICategoryGovernanceReview extends Document {
  internalCoinId: string;
  catalogVersion: number;
  conflictType: string;
  status: GovernanceReviewStatus;
  details: Record<string, unknown>;
  resolution?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  firstSeenAt: Date;
}

const categoryGovernanceReviewSchema = new Schema<ICategoryGovernanceReview>(
  {
    internalCoinId: { type: String, required: true, index: true },
    catalogVersion: { type: Number, required: true },
    conflictType: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'deferred'],
      default: 'pending',
      index: true,
    },
    details: { type: Schema.Types.Mixed, default: {} },
    resolution: { type: String },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    firstSeenAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: 'category_governance_reviews' }
);

categoryGovernanceReviewSchema.index({ internalCoinId: 1, catalogVersion: 1, status: 1 });

export const CategoryGovernanceReview = mongoose.model<ICategoryGovernanceReview>(
  'CategoryGovernanceReview',
  categoryGovernanceReviewSchema
);
