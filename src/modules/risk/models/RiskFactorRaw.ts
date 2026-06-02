import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskFactorRaw extends Document {
  buildId: string;
  symbol: string;
  factor: string;
  raw: number;
  confidence: number;
  flags: string[];
  factorSnapshotTime: Date;
  buildCutoffTime: Date;
  stalenessMs: number;
  invalid: boolean;
  providerVersion: string;
  inputsHash?: string;
}

const riskFactorRawSchema = new Schema<IRiskFactorRaw>(
  {
    buildId: { type: String, required: true },
    symbol: { type: String, required: true, uppercase: true },
    factor: { type: String, required: true },
    raw: { type: Number, required: true },
    confidence: { type: Number, required: true },
    flags: { type: [String], default: [] },
    factorSnapshotTime: { type: Date, required: true },
    buildCutoffTime: { type: Date, required: true },
    stalenessMs: { type: Number, required: true },
    invalid: { type: Boolean, default: false },
    providerVersion: { type: String, required: true },
    inputsHash: { type: String },
  },
  { timestamps: true }
);

riskFactorRawSchema.index({ buildId: 1, symbol: 1, factor: 1 }, { unique: true });
riskFactorRawSchema.index({ buildId: 1 });
riskFactorRawSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const RiskFactorRaw = mongoose.model<IRiskFactorRaw>(
  'RiskFactorRaw',
  riskFactorRawSchema,
  'risk_factor_raws'
);
