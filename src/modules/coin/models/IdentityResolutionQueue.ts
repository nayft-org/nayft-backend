import mongoose, { Document, Schema } from 'mongoose';

export type ResolutionSource = 'providerId' | 'symbol' | 'fallback';
export type ResolutionStatus = 'pending' | 'retrying' | 'resolved' | 'manual_review' | 'archived';

export interface IIdentityResolutionQueue extends Document {
  inputToken: string;
  normalizedToken: string;
  evidence: Record<string, unknown>;
  candidates: unknown[];
  confidence: number;
  resolutionSource?: ResolutionSource;
  status: ResolutionStatus;
  firstSeenAt: Date;
  lastTriedAt?: Date;
  retryCount: number;
  resolutionError?: string;
}

const identityResolutionQueueSchema = new Schema<IIdentityResolutionQueue>(
  {
    inputToken: { type: String, required: true },
    normalizedToken: { type: String, required: true, index: true },
    evidence: { type: Schema.Types.Mixed, default: {} },
    candidates: { type: Array, default: [] },
    confidence: { type: Number, required: true, default: 0 },
    resolutionSource: {
      type: String,
      enum: ['providerId', 'symbol', 'fallback'],
    },
    status: {
      type: String,
      enum: ['pending', 'retrying', 'resolved', 'manual_review', 'archived'],
      required: true,
      default: 'pending',
      index: true,
    },
    firstSeenAt: { type: Date, required: true, default: Date.now },
    lastTriedAt: { type: Date },
    retryCount: { type: Number, default: 0 },
    resolutionError: { type: String },
  },
  { timestamps: true }
);

identityResolutionQueueSchema.index({ status: 1, retryCount: 1 });
identityResolutionQueueSchema.index({ normalizedToken: 1, status: 1 });

export const IdentityResolutionQueue = mongoose.model<IIdentityResolutionQueue>(
  'IdentityResolutionQueue',
  identityResolutionQueueSchema,
  'coin_identity_resolution_queue'
);

