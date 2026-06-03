import mongoose, { Schema, Document } from 'mongoose';

/**
 * Materialized daily OHLC risk features (RRS-2 design).
 * Populated by a future downsampler job — not written in v1 builds.
 */
export interface IRiskOhlcFeatures extends Document {
  symbol: string;
  exchange: string;
  interval: string;
  openTime: Date;
  parkinsonVol1d?: number;
  ewmaVol1h?: number;
  maxDrawdown30d?: number;
  amihudIlliquidity?: number;
  candleCount: number;
  computedAt: Date;
}

const schema = new Schema<IRiskOhlcFeatures>(
  {
    symbol: { type: String, required: true, uppercase: true },
    exchange: { type: String, default: 'binance' },
    interval: { type: String, default: '1d' },
    openTime: { type: Date, required: true },
    parkinsonVol1d: { type: Number },
    ewmaVol1h: { type: Number },
    maxDrawdown30d: { type: Number },
    amihudIlliquidity: { type: Number },
    candleCount: { type: Number, default: 0 },
    computedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

schema.index({ symbol: 1, openTime: -1 }, { unique: true });

export const RiskOhlcFeatures = mongoose.model<IRiskOhlcFeatures>(
  'RiskOhlcFeatures',
  schema,
  'risk_ohlc_features'
);
