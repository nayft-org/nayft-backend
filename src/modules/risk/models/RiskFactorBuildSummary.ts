import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskFactorBuildSummary extends Document {
  buildId: string;
  revision?: number;
  factor: string;
  universeSize: number;
  eligibleCount: number;
  rawMean: number;
  rawStd: number;
  rawP50: number;
  rawP95: number;
  computedAt: Date;
}

const schema = new Schema<IRiskFactorBuildSummary>(
  {
    buildId: { type: String, required: true },
    revision: { type: Number },
    factor: { type: String, required: true },
    universeSize: { type: Number, required: true },
    eligibleCount: { type: Number, required: true },
    rawMean: { type: Number, required: true },
    rawStd: { type: Number, required: true },
    rawP50: { type: Number, required: true },
    rawP95: { type: Number, required: true },
    computedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

schema.index({ buildId: 1, factor: 1 }, { unique: true });
schema.index({ computedAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

export const RiskFactorBuildSummary = mongoose.model<IRiskFactorBuildSummary>(
  'RiskFactorBuildSummary',
  schema,
  'risk_factor_build_summary'
);
