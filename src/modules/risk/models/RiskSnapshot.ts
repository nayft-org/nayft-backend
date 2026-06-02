import mongoose, { Schema, Document } from 'mongoose';

const factorDetailSchema = new Schema(
  {
    raw: { type: Number, required: true },
    normalized: { type: Number, required: true },
    confidence: { type: Number, required: true },
    flags: { type: [String], default: [] },
  },
  { _id: false }
);

export interface IRiskSnapshot extends Document {
  symbol: string;
  internalCoinId?: string;
  buildId: string;
  revision: number;
  buildFingerprint: string;
  computedAt: Date;
  crs: number;
  crsRaw: number;
  rank: number;
  percentile: number;
  confidence: number;
  factors: {
    volatility: { raw: number; normalized: number; confidence: number; flags: string[] };
    liquidity: { raw: number; normalized: number; confidence: number; flags: string[] };
    drawdown: { raw: number; normalized: number; confidence: number; flags: string[] };
    fundamentals: { raw: number; normalized: number; confidence: number; flags: string[] };
    news: { raw: number; normalized: number; confidence: number; flags: string[] };
  };
  regime: string;
  sentimentRevision?: number;
  flags: string[];
}

const riskSnapshotSchema = new Schema<IRiskSnapshot>(
  {
    symbol: { type: String, required: true, uppercase: true },
    internalCoinId: { type: String },
    buildId: { type: String, required: true },
    revision: { type: Number, required: true },
    buildFingerprint: { type: String, required: true },
    computedAt: { type: Date, required: true },
    crs: { type: Number, required: true },
    crsRaw: { type: Number, required: true },
    rank: { type: Number, required: true },
    percentile: { type: Number, required: true },
    confidence: { type: Number, required: true },
    factors: {
      volatility: { type: factorDetailSchema, required: true },
      liquidity: { type: factorDetailSchema, required: true },
      drawdown: { type: factorDetailSchema, required: true },
      fundamentals: { type: factorDetailSchema, required: true },
      news: { type: factorDetailSchema, required: true },
    },
    regime: { type: String, required: true },
    sentimentRevision: { type: Number },
    flags: { type: [String], default: [] },
  },
  { timestamps: true }
);

riskSnapshotSchema.index({ symbol: 1, revision: -1 });
riskSnapshotSchema.index({ revision: -1 });
riskSnapshotSchema.index({ crs: -1, revision: 1 });
riskSnapshotSchema.index({ buildId: 1 });

export const RiskSnapshot = mongoose.model<IRiskSnapshot>(
  'RiskSnapshot',
  riskSnapshotSchema,
  'risk_snapshots'
);
