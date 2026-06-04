import mongoose, { Schema, Document } from 'mongoose';

export interface ICoinCategoryCatalogEntry extends Document {
  categoryId: string;
  name: string;
  catalogVersion: number;
}

const coinCategoryCatalogSchema = new Schema<ICoinCategoryCatalogEntry>(
  {
    categoryId: { type: String, required: true },
    name: { type: String, required: true },
    catalogVersion: { type: Number, required: true, index: true },
  },
  { timestamps: true, collection: 'coin_category_catalog' }
);

coinCategoryCatalogSchema.index({ categoryId: 1, catalogVersion: 1 }, { unique: true });

export const CoinCategoryCatalog = mongoose.model<ICoinCategoryCatalogEntry>(
  'CoinCategoryCatalog',
  coinCategoryCatalogSchema
);
