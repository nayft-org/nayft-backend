import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskScoreHistory extends Document {
  symbol: string;
  buildId: string;
  revision: number;
  computedAt: Date;
  crs: number;
  rank: number;
  regime: string;
}

const riskScoreHistorySchema = new Schema<IRiskScoreHistory>(
  {
    symbol: { type: String, required: true, uppercase: true },
    buildId: { type: String, required: true },
    revision: { type: Number, required: true },
    computedAt: { type: Date, required: true },
    crs: { type: Number, required: true },
    rank: { type: Number, required: true },
    regime: { type: String, required: true },
  },
  { timestamps: true }
);

riskScoreHistorySchema.index({ symbol: 1, computedAt: -1 });
riskScoreHistorySchema.index({ revision: -1 });

export const RiskScoreHistory = mongoose.model<IRiskScoreHistory>(
  'RiskScoreHistory',
  riskScoreHistorySchema,
  'risk_score_history'
);
