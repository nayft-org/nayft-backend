import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscription extends Document {
  userId: string;
  planKey: string;
  status: 'active' | 'cancelled' | 'expired';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: String, required: true, index: true },
    planKey: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired'],
      default: 'active',
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'subscriptions' }
);

subscriptionSchema.index({ userId: 1, planKey: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
