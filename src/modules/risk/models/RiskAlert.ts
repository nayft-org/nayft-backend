import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskAlert extends Document {
  symbol?: string;
  alertType: string;
  revision: number;
  buildId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
}

const riskAlertSchema = new Schema<IRiskAlert>(
  {
    symbol: { type: String, uppercase: true },
    alertType: { type: String, required: true },
    revision: { type: Number, required: true },
    buildId: { type: String, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
    message: { type: String, required: true },
    dedupeKey: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

riskAlertSchema.index({ dedupeKey: 1, createdAt: -1 });
riskAlertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export const RiskAlert = mongoose.model<IRiskAlert>('RiskAlert', riskAlertSchema, 'risk_alerts');
