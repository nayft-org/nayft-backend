import mongoose, { Schema, Document } from 'mongoose';

export interface IFeatureAuditLog extends Document {
  featureKey: string;
  action: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  userId?: string;
  timestamp: Date;
}

const featureAuditSchema = new Schema<IFeatureAuditLog>(
  {
    featureKey: { type: String, required: true, index: true },
    action: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    userId: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { collection: 'feature_audit_logs', timestamps: false }
);

export const FeatureAuditLog = mongoose.model<IFeatureAuditLog>(
  'FeatureAuditLog',
  featureAuditSchema
);
