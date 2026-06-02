import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskRecalcJob extends Document {
  buildId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  reason?: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

const riskRecalcJobSchema = new Schema<IRiskRecalcJob>(
  {
    buildId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], required: true },
    reason: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

riskRecalcJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const RiskRecalcJob = mongoose.model<IRiskRecalcJob>(
  'RiskRecalcJob',
  riskRecalcJobSchema,
  'risk_recalc_jobs'
);
