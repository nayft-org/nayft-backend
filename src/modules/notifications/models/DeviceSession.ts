import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceSession extends Document {
  userId: mongoose.Types.ObjectId;
  deviceId: string;
  platform: string;
  pushToken?: string;
  wsSessionId?: string;
  lastSeenAt: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

const DeviceSessionSchema = new Schema<IDeviceSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    platform: { type: String, required: true },
    pushToken: { type: String },
    wsSessionId: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

DeviceSessionSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
DeviceSessionSchema.index({ pushToken: 1 });
DeviceSessionSchema.index({ lastSeenAt: -1 });

export const DeviceSessionModel =
  mongoose.models.DeviceSession || mongoose.model<IDeviceSession>('DeviceSession', DeviceSessionSchema);
