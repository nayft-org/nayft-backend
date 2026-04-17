import mongoose, { Schema, Document } from 'mongoose';
import type { ProviderType } from './CoinRawData';

export interface IFilteredCoin extends Document {
  internalCoinId?: string;
  provider: ProviderType;
  provider_coin_id: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  status: string;
  raw_payload: Record<string, unknown>;
  fetched_at: Date;
  provider_timestamp?: Date;
}

const filteredCoinSchema = new Schema<IFilteredCoin>(
  {
    internalCoinId: { type: String, index: true },
    provider: { type: String, required: true, enum: ['binance', 'bybit', 'okx', 'coinbase'] },
    provider_coin_id: { type: String, required: true },
    symbol: { type: String, required: true },
    base_asset: { type: String, required: true },
    quote_asset: { type: String, required: true },
    status: { type: String, required: true },
    raw_payload: { type: Schema.Types.Mixed, required: true },
    fetched_at: { type: Date, required: true, default: Date.now },
    provider_timestamp: { type: Date },
  },
  { timestamps: true }
);

filteredCoinSchema.index({ base_asset: 1, provider: 1 }, { unique: true });
filteredCoinSchema.index({ internalCoinId: 1 });

export const FilteredCoin = mongoose.model<IFilteredCoin>(
  'FilteredCoin',
  filteredCoinSchema,
  'exchange_listed_assets'
);
