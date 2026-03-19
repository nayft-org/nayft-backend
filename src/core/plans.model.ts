import mongoose, { Schema, Document } from 'mongoose';

export interface IPlan extends Document {
  key: string;
  name: string;
  description: string;
  featureKeys: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const planSchema = new Schema<IPlan>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    featureKeys: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'plans' }
);

export const Plan = mongoose.model<IPlan>('Plan', planSchema);
