import mongoose, { Schema, Document } from 'mongoose';

export interface IFeature extends Document {
  key: string;
  name: string;
  module: string;
  description: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  category: 'free' | 'premium' | 'enterprise';
  controllable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const featureSchema = new Schema<IFeature>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    module: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    category: {
      type: String,
      enum: ['free', 'premium', 'enterprise'],
      default: 'free',
    },
    controllable: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'feature_registry',
  }
);

export const Feature = mongoose.model<IFeature>('Feature', featureSchema);
