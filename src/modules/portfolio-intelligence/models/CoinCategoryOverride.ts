import mongoose, { Schema, Document } from 'mongoose';

export interface ICoinCategoryOverride extends Document {
  internalCoinId: string;
  primaryCategoryId: string;
  secondaryCategoryIds: string[];
  reason: string;
  createdBy: string;
}

const coinCategoryOverrideSchema = new Schema<ICoinCategoryOverride>(
  {
    internalCoinId: { type: String, required: true, unique: true },
    primaryCategoryId: { type: String, required: true },
    secondaryCategoryIds: { type: [String], default: [] },
    reason: { type: String, required: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, collection: 'coin_category_overrides' }
);

export const CoinCategoryOverride = mongoose.model<ICoinCategoryOverride>(
  'CoinCategoryOverride',
  coinCategoryOverrideSchema
);
