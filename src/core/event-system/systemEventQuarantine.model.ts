import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemEventQuarantine extends Document {
  originalId: mongoose.Types.ObjectId;
  featureKey?: string;
  eventType?: string;
  reason: string;
  payload: Record<string, unknown>;
  migratedAt: Date;
  complianceMigrationVersion: number;
}

const quarantineSchema = new Schema<ISystemEventQuarantine>(
  {
    originalId: { type: Schema.Types.ObjectId, required: true, index: true, unique: true },
    featureKey: { type: String },
    eventType: { type: String },
    reason: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    migratedAt: { type: Date, default: Date.now },
    complianceMigrationVersion: { type: Number, default: -1 },
  },
  { collection: 'system_events_quarantine', timestamps: false }
);

quarantineSchema.index({ migratedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const SystemEventQuarantine =
  mongoose.models.SystemEventQuarantine ||
  mongoose.model<ISystemEventQuarantine>('SystemEventQuarantine', quarantineSchema);
