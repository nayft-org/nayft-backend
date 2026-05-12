import mongoose, { Schema, Document } from 'mongoose';

export interface IUserNotificationChannel extends Document {
  userId: mongoose.Types.ObjectId;
  channel: string;
  enabled: boolean;
  verified: boolean;
  address?: string;
  settings?: Record<string, unknown>;
}

const UserNotificationChannelSchema = new Schema<IUserNotificationChannel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
    address: { type: String },
    settings: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

UserNotificationChannelSchema.index({ userId: 1, channel: 1 }, { unique: true });
UserNotificationChannelSchema.index({ channel: 1, verified: 1 });

export const UserNotificationChannelModel =
  mongoose.models.UserNotificationChannel ||
  mongoose.model<IUserNotificationChannel>('UserNotificationChannel', UserNotificationChannelSchema);
