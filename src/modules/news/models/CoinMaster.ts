import mongoose, { Schema } from 'mongoose';

export interface ICoinMaster {
  internalCoinId?: string;
  symbol: string;
  name: string;
  keywords: string[];
}

const coinMasterSchema = new Schema<ICoinMaster>(
  {
    internalCoinId: { type: String, index: true },
    symbol: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    keywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const CoinMaster = mongoose.model<ICoinMaster>(
  'CoinMaster',
  coinMasterSchema,
  'coin_news_tagging_map'
);
