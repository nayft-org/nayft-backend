import mongoose, { Schema, Document } from 'mongoose';

export type SnapshotTrigger = 'delta' | 'daily' | 'manual' | 'recompute';

export interface ISnapshotPosition {
  positionKey: string;
  symbol: string;
  valueUsd: number;
  weightPct: number;
  internalCoinId: string | null;
}

export interface IPortfolioSnapshot extends Document {
  userId: string;
  snapshotId: string;
  asOf: Date;
  revision: number;
  ingestRevision: number;
  positions: ISnapshotPosition[];
  totalValueUsd: number;
  trigger: SnapshotTrigger;
  ttlExpiresAt: Date;
}

const snapshotPositionSchema = new Schema<ISnapshotPosition>(
  {
    positionKey: { type: String, required: true },
    symbol: { type: String, required: true },
    valueUsd: { type: Number, required: true },
    weightPct: { type: Number, required: true },
    internalCoinId: { type: String, default: null },
  },
  { _id: false }
);

const portfolioSnapshotSchema = new Schema<IPortfolioSnapshot>(
  {
    userId: { type: String, required: true, index: true },
    snapshotId: { type: String, required: true, unique: true },
    asOf: { type: Date, required: true },
    revision: { type: Number, required: true },
    ingestRevision: { type: Number, required: true },
    positions: { type: [snapshotPositionSchema], default: [] },
    totalValueUsd: { type: Number, required: true },
    trigger: { type: String, enum: ['delta', 'daily', 'manual', 'recompute'], required: true },
    ttlExpiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'portfolio_snapshots' }
);

portfolioSnapshotSchema.index({ userId: 1, asOf: -1 });
portfolioSnapshotSchema.index({ ttlExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const PortfolioSnapshot = mongoose.model<IPortfolioSnapshot>(
  'PortfolioSnapshot',
  portfolioSnapshotSchema
);
