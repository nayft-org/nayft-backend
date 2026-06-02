import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskRegime extends Document {
  scope: 'market' | 'sector' | 'coin';
  scopeId: string;
  regime: string;
  previousRegime?: string;
  confidence: number;
  revision: number;
  buildId: string;
  computedAt: Date;
  drivers: string[];
}

const riskRegimeSchema = new Schema<IRiskRegime>(
  {
    scope: { type: String, enum: ['market', 'sector', 'coin'], required: true },
    scopeId: { type: String, required: true },
    regime: { type: String, required: true },
    previousRegime: { type: String },
    confidence: { type: Number, required: true },
    revision: { type: Number, required: true },
    buildId: { type: String, required: true },
    computedAt: { type: Date, required: true },
    drivers: { type: [String], default: [] },
  },
  { timestamps: true }
);

riskRegimeSchema.index({ scope: 1, scopeId: 1, revision: -1 });
riskRegimeSchema.index({ revision: -1 });

export const RiskRegime = mongoose.model<IRiskRegime>('RiskRegime', riskRegimeSchema, 'risk_regimes');
