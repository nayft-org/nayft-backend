import mongoose, { Schema, Document } from 'mongoose';

export interface ICoinSentimentSnapshot extends Document {
  symbol: string;
  internalCoinId?: string;
  computedAt: Date;
  windowHours: number;
  articleCount: number;
  weightedScore: number;
  normalizedScore: number;
  confidence: number;
  bullishRatio: number;
  bearishRatio: number;
  riskRatio: number;
  revision: number;
  topHeadlines?: Array<{
    externalId: string;
    title: string;
    score: number;
    publishedAt: Date;
  }>;
}

const headlineSchema = new Schema(
  {
    externalId: { type: String, required: true },
    title: { type: String, required: true },
    score: { type: Number, required: true },
    publishedAt: { type: Date, required: true },
  },
  { _id: false }
);

const coinSentimentSnapshotSchema = new Schema<ICoinSentimentSnapshot>(
  {
    symbol: { type: String, required: true, uppercase: true },
    internalCoinId: { type: String },
    computedAt: { type: Date, required: true },
    windowHours: { type: Number, required: true },
    articleCount: { type: Number, required: true },
    weightedScore: { type: Number, required: true },
    normalizedScore: { type: Number, required: true },
    confidence: { type: Number, required: true },
    bullishRatio: { type: Number, required: true },
    bearishRatio: { type: Number, required: true },
    riskRatio: { type: Number, required: true },
    revision: { type: Number, required: true },
    topHeadlines: { type: [headlineSchema], default: [] },
  },
  { timestamps: true }
);

coinSentimentSnapshotSchema.index({ symbol: 1, computedAt: -1 });
coinSentimentSnapshotSchema.index({ computedAt: -1, weightedScore: 1 });

export const CoinSentimentSnapshot = mongoose.model<ICoinSentimentSnapshot>(
  'CoinSentimentSnapshot',
  coinSentimentSnapshotSchema,
  'coin_sentiment_snapshots'
);
