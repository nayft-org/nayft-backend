import mongoose, { Schema, Document } from 'mongoose';

export type ProviderType = 'binance' | 'bybit' | 'okx' | 'coinbase';

export interface ICoinRawData extends Document {
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

const coinRawDataSchema = new Schema<ICoinRawData>(
  {
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

coinRawDataSchema.index({ provider: 1 });
coinRawDataSchema.index({ symbol: 1 });
coinRawDataSchema.index({ fetched_at: -1 });
coinRawDataSchema.index({ provider: 1, provider_coin_id: 1 }, { unique: true });

export const CoinRawData = mongoose.model<ICoinRawData>('CoinRawData', coinRawDataSchema, 'coin_raw_data');
