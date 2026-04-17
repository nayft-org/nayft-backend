import mongoose, { Schema, Document } from 'mongoose';
import type { ProviderType } from './CoinRawData';

export interface ICmcQuoteUsd {
  price?: number;
  volume_24h?: number;
  percent_change_24h?: number;
  market_cap?: number;
  market_cap_dominance?: number;
  fully_diluted_market_cap?: number;
  last_updated?: string;
}

export interface ICmcLabeledCoin extends Document {
  internalCoinId?: string;
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmc_rank?: number;
  num_market_pairs?: number;
  circulating_supply?: number;
  total_supply?: number | null;
  max_supply?: number | null;
  date_added?: string;
  last_updated?: string;
  quote_usd?: ICmcQuoteUsd;
  coinIds: Partial<Record<ProviderType, string>>;
}

const cmcQuoteUsdSchema = new Schema(
  {
    price: { type: Number },
    volume_24h: { type: Number },
    percent_change_24h: { type: Number },
    market_cap: { type: Number },
    market_cap_dominance: { type: Number },
    fully_diluted_market_cap: { type: Number },
    last_updated: { type: String },
  },
  { _id: false }
);

const cmcLabeledCoinSchema = new Schema<ICmcLabeledCoin>(
  {
    internalCoinId: { type: String, index: true },
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    slug: { type: String, required: true },
    cmc_rank: { type: Number },
    num_market_pairs: { type: Number },
    circulating_supply: { type: Number },
    total_supply: { type: Schema.Types.Mixed },
    max_supply: { type: Schema.Types.Mixed },
    date_added: { type: String },
    last_updated: { type: String },
    quote_usd: { type: cmcQuoteUsdSchema },
    coinIds: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

cmcLabeledCoinSchema.index({ id: 1 }, { unique: true });
cmcLabeledCoinSchema.index({ internalCoinId: 1 });
cmcLabeledCoinSchema.index({ symbol: 1 });
cmcLabeledCoinSchema.index({ cmc_rank: 1 });

export const CmcLabeledCoin = mongoose.model<ICmcLabeledCoin>(
  'CmcLabeledCoin',
  cmcLabeledCoinSchema,
  'cmc_coin_mappings'
);
