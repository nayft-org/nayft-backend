import mongoose, { Schema, Document } from 'mongoose';

export interface ICoinCategoryMapping extends Document {
  internalCoinId: string;
  primaryCategoryId: string;
  secondaryCategoryIds: string[];
  confidence: number;
  source: 'coingecko' | 'inferred' | 'override';
  catalogVersion: number;
  overriddenAt?: Date;
}

const coinCategoryMappingSchema = new Schema<ICoinCategoryMapping>(
  {
    internalCoinId: { type: String, required: true },
    primaryCategoryId: { type: String, required: true },
    secondaryCategoryIds: { type: [String], default: [] },
    confidence: { type: Number, required: true },
    source: { type: String, enum: ['coingecko', 'inferred', 'override'], required: true },
    catalogVersion: { type: Number, required: true },
    overriddenAt: { type: Date },
  },
  { timestamps: true, collection: 'coin_category_mappings' }
);

coinCategoryMappingSchema.index({ internalCoinId: 1, catalogVersion: 1 }, { unique: true });
coinCategoryMappingSchema.index({ primaryCategoryId: 1 });

export const CoinCategoryMapping = mongoose.model<ICoinCategoryMapping>(
  'CoinCategoryMapping',
  coinCategoryMappingSchema
);
