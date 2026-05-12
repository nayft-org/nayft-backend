import mongoose, { Schema, Document } from 'mongoose';

export interface INotificationBatch extends Document {
  batchId: string;
  userId: mongoose.Types.ObjectId;
  digestType: string;
  windowStart: Date;
  windowEnd: Date;
  items: unknown[];
  status: string;
  scheduledAt?: Date;
  sentAt?: Date;
}

const NotificationBatchSchema = new Schema<INotificationBatch>(
  {
    batchId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    digestType: { type: String, required: true },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true },
    items: { type: [Schema.Types.Mixed], default: [] },
    status: { type: String, required: true, default: 'pending' },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

NotificationBatchSchema.index({ userId: 1, digestType: 1, windowEnd: -1 });
NotificationBatchSchema.index({ status: 1, scheduledAt: 1 });

export const NotificationBatchModel =
  mongoose.models.NotificationBatch ||
  mongoose.model<INotificationBatch>('NotificationBatch', NotificationBatchSchema);
