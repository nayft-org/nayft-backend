import mongoose, { Schema, Document } from 'mongoose';

export interface INotificationDeliveryLog extends Document {
  notificationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  channel: string;
  provider?: string;
  attempt: number;
  status: string;
  errorCode?: string;
  latencyMs?: number;
  providerMessageId?: string;
  createdAt: Date;
  expireAt?: Date;
}

const NotificationDeliveryLogSchema = new Schema<INotificationDeliveryLog>(
  {
    notificationId: { type: Schema.Types.ObjectId, ref: 'Notification', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, required: true },
    provider: { type: String },
    attempt: { type: Number, required: true, default: 1 },
    status: { type: String, required: true },
    errorCode: { type: String },
    latencyMs: { type: Number },
    providerMessageId: { type: String },
    expireAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationDeliveryLogSchema.index({ notificationId: 1, channel: 1, attempt: -1 });
NotificationDeliveryLogSchema.index({ createdAt: -1 });
NotificationDeliveryLogSchema.index({ status: 1, createdAt: -1 });
/** TTL index: enable via migrations once expireAt is always set on writes. */

export const NotificationDeliveryLogModel =
  mongoose.models.NotificationDeliveryLog ||
  mongoose.model<INotificationDeliveryLog>('NotificationDeliveryLog', NotificationDeliveryLogSchema);
