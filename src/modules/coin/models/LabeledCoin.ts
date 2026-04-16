import mongoose, { Schema, Document } from 'mongoose';
import type { ProviderType } from './CoinRawData';

export interface ILabeledCoin extends Document {
  internalCoinId?: string;
  id: string;
  symbol: string;
  name: string;
  coinIds: Partial<Record<ProviderType, string>>;
  migratedAt?: Date;
  migrationVersion?: string;
}

const labeledCoinSchema = new Schema<ILabeledCoin>(
  {
    internalCoinId: { type: String, index: true },
    id: { type: String, required: true, unique: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    coinIds: { type: Schema.Types.Mixed, default: {} },
    migratedAt: { type: Date },
    migrationVersion: { type: String },
  },
  { timestamps: true }
);

labeledCoinSchema.index({ id: 1 }, { unique: true });
labeledCoinSchema.index({ symbol: 1 });
labeledCoinSchema.index({ internalCoinId: 1 });

export const LabeledCoin = mongoose.model<ILabeledCoin>(
  'LabeledCoin',
  labeledCoinSchema,
  'coingecko_coin_mappings'
);
