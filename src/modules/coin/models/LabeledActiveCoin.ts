import mongoose, { Schema, Document } from 'mongoose';
import type { ProviderType } from './CoinRawData';

export interface ILabeledActiveCoin extends Document {
  internalCoinId?: string;
  provider: string;
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  fully_diluted_valuation?: number;
  total_volume?: number;
  high_24h?: number;
  low_24h?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
  market_cap_change_24h?: number;
  market_cap_change_percentage_24h?: number;
  circulating_supply?: number;
  total_supply?: number | null;
  max_supply?: number | null;
  ath?: number;
  ath_change_percentage?: number;
  ath_date?: string;
  atl?: number;
  atl_change_percentage?: number;
  atl_date?: string;
  last_updated?: string;
  relatedIDs: Partial<Record<ProviderType, string>>;
}

const labeledActiveCoinSchema = new Schema<ILabeledActiveCoin>(
  {
    internalCoinId: { type: String, index: true },
    provider: { type: String, required: true, default: 'coingecko', index: true },
    id: { type: String, required: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    image: { type: String },
    current_price: { type: Number },
    market_cap: { type: Number },
    market_cap_rank: { type: Number },
    fully_diluted_valuation: { type: Number },
    total_volume: { type: Number },
    high_24h: { type: Number },
    low_24h: { type: Number },
    price_change_24h: { type: Number },
    price_change_percentage_24h: { type: Number },
    market_cap_change_24h: { type: Number },
    market_cap_change_percentage_24h: { type: Number },
    circulating_supply: { type: Number },
    total_supply: { type: Schema.Types.Mixed },
    max_supply: { type: Schema.Types.Mixed },
    ath: { type: Number },
    ath_change_percentage: { type: Number },
    ath_date: { type: String },
    atl: { type: Number },
    atl_change_percentage: { type: Number },
    atl_date: { type: String },
    last_updated: { type: String },
    relatedIDs: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

labeledActiveCoinSchema.index({ id: 1, provider: 1 }, { unique: true });
labeledActiveCoinSchema.index({ internalCoinId: 1, provider: 1 });
labeledActiveCoinSchema.index({ symbol: 1 });
labeledActiveCoinSchema.index({ market_cap_rank: 1 });

export const LabeledActiveCoin = mongoose.model<ILabeledActiveCoin>(
  'LabeledActiveCoin',
  labeledActiveCoinSchema,
  'coin_market_snapshots'
);
