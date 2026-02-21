import mongoose, { Schema } from 'mongoose';

export interface ICoinMaster {
  symbol: string;
  name: string;
  keywords: string[];
}

const coinMasterSchema = new Schema<ICoinMaster>(
  {
    symbol: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    keywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const CoinMaster = mongoose.model<ICoinMaster>('CoinMaster', coinMasterSchema);
