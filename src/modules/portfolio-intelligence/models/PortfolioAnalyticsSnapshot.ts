import mongoose, { Schema, Document } from 'mongoose';
import type { AnalyticsShellPayload } from '../contracts/piContracts';

export interface IPortfolioAnalyticsSnapshot extends Document {
  userId: string;
  revision: number;
  schemaVersion: number;
  computedAt: Date;
  inputsRevision: number;
  catalogVersion: number;
  buildFingerprint: string;
  payload: AnalyticsShellPayload;
}

const portfolioAnalyticsSnapshotSchema = new Schema<IPortfolioAnalyticsSnapshot>(
  {
    userId: { type: String, required: true, index: true },
    revision: { type: Number, required: true },
    schemaVersion: { type: Number, required: true },
    computedAt: { type: Date, required: true },
    inputsRevision: { type: Number, required: true },
    catalogVersion: { type: Number, required: true },
    buildFingerprint: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: 'portfolio_analytics_snapshots' }
);

portfolioAnalyticsSnapshotSchema.index({ userId: 1, revision: -1 });
portfolioAnalyticsSnapshotSchema.index({ userId: 1, computedAt: -1 });

export const PortfolioAnalyticsSnapshot = mongoose.model<IPortfolioAnalyticsSnapshot>(
  'PortfolioAnalyticsSnapshot',
  portfolioAnalyticsSnapshotSchema
);
