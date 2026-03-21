import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemEvent extends Document {
  featureKey: string;
  eventType: string;
  userId?: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
  invalidFeature?: boolean;
}

const systemEventSchema = new Schema<ISystemEvent>(
  {
    featureKey: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    invalidFeature: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'system_events',
    timestamps: false,
  }
);

// Compound index for efficient queries by featureKey + date range
systemEventSchema.index({ featureKey: 1, timestamp: -1 });
systemEventSchema.index({ featureKey: 1, eventType: 1, timestamp: -1 });

export const SystemEvent = mongoose.model<ISystemEvent>('SystemEvent', systemEventSchema);
