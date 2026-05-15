import mongoose, { Schema, Document } from 'mongoose';

export interface INotificationPreference extends Document {
  userId: mongoose.Types.ObjectId;
  global?: Record<string, unknown>;
  categoryPrefs?: Record<string, unknown>;
  typePrefs?: Record<string, unknown>;
  quietHours?: { start: string; end: string };
  timezone?: string;
  channelPrefs?: Record<string, unknown>;
  digestPrefs?: Record<string, unknown>;
  version: number;
  updatedAt: Date;
}

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    global: { type: Schema.Types.Mixed },
    categoryPrefs: { type: Schema.Types.Mixed },
    typePrefs: { type: Schema.Types.Mixed },
    quietHours: {
      start: String,
      end: String,
    },
    timezone: { type: String, default: 'UTC' },
    channelPrefs: { type: Schema.Types.Mixed },
    digestPrefs: { type: Schema.Types.Mixed },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

NotificationPreferenceSchema.index({ updatedAt: -1 });

export const NotificationPreferenceModel =
  mongoose.models.NotificationPreference ||
  mongoose.model<INotificationPreference>('NotificationPreference', NotificationPreferenceSchema);
