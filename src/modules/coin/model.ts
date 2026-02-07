import mongoose, { Schema } from 'mongoose';
import { ICoin } from '../../types';

const coinSchema = new Schema<ICoin>(
  {
    coinId: {
      type: String,
      required: true,
      unique: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    rank: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    percentChange24h: {
      type: Number,
      default: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const Coin = mongoose.model<ICoin>('Coin', coinSchema);

