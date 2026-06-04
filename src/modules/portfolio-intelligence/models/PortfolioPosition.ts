import mongoose, { Schema, Document } from 'mongoose';

export interface IPortfolioPosition extends Document {
  userId: string;
  positionKey: string;
  internalCoinId: string | null;
  coingeckoId: string | null;
  symbol: string;
  name: string;
  chain: string;
  contractAddress?: string;
  quantity: number;
  valueUsd: number;
  weightPct: number;
  source: 'wallet' | 'exchange';
  venue?: string;
  sourceConnectionId?: string;
  mappingConfidence: number;
  normalizedAt: Date;
  ingestRevision: number;
}

const portfolioPositionSchema = new Schema<IPortfolioPosition>(
  {
    userId: { type: String, required: true, index: true },
    positionKey: { type: String, required: true },
    internalCoinId: { type: String, default: null },
    coingeckoId: { type: String, default: null },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    chain: { type: String, required: true },
    contractAddress: { type: String },
    quantity: { type: Number, required: true },
    valueUsd: { type: Number, required: true },
    weightPct: { type: Number, required: true },
    source: { type: String, enum: ['wallet', 'exchange'], required: true },
    venue: { type: String },
    sourceConnectionId: { type: String },
    mappingConfidence: { type: Number, required: true, default: 0 },
    normalizedAt: { type: Date, required: true },
    ingestRevision: { type: Number, required: true },
  },
  { timestamps: true, collection: 'portfolio_positions' }
);

portfolioPositionSchema.index({ userId: 1, positionKey: 1 }, { unique: true });
portfolioPositionSchema.index({ userId: 1, internalCoinId: 1 });
portfolioPositionSchema.index({ internalCoinId: 1 });

export const PortfolioPosition = mongoose.model<IPortfolioPosition>(
  'PortfolioPosition',
  portfolioPositionSchema
);
