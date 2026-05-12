import mongoose, { Schema, Document } from 'mongoose';

export type NotificationStatus = 'unread' | 'read' | 'archived' | 'deleted';
export type NotificationPriority = 'CRITICAL' | 'IMPORTANT' | 'STANDARD' | 'BULK';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  category: string;
  type: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  status: NotificationStatus;
  channelStates?: Record<string, unknown>;
  groupKey?: string;
  dedupeKey?: string;
  sourceEventId?: string;
  userSeq: number;
  version: number;
  createdAt: Date;
  readAt?: Date;
  archivedAt?: Date;
  expireAt?: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, required: true },
    type: { type: String, required: true },
    priority: {
      type: String,
      enum: ['CRITICAL', 'IMPORTANT', 'STANDARD', 'BULK'],
      default: 'STANDARD',
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['unread', 'read', 'archived', 'deleted'],
      default: 'unread',
      index: true,
    },
    channelStates: { type: Schema.Types.Mixed },
    groupKey: { type: String },
    dedupeKey: { type: String },
    sourceEventId: { type: String },
    userSeq: { type: Number, required: true },
    version: { type: Number, default: 0 },
    readAt: { type: Date },
    archivedAt: { type: Date },
    expireAt: { type: Date },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, status: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
NotificationSchema.index({ userId: 1, status: 1, priority: -1, createdAt: -1 });
NotificationSchema.index({ dedupeKey: 1, createdAt: -1 });
NotificationSchema.index(
  { userId: 1, createdAt: -1 },
  { partialFilterExpression: { status: 'unread' } }
);
NotificationSchema.index({ userId: 1, userSeq: 1 }, { unique: true });

export const NotificationModel =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
