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
    symbolLower: {
      type: String,
      index: true,
    },
    nameLower: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to populate lowercase fields for efficient search
coinSchema.pre('save', function(next) {
  if (this.symbol) {
    this.symbolLower = this.symbol.toLowerCase();
  }
  if (this.name) {
    this.nameLower = this.name.toLowerCase();
  }
  next();
});

// Also update on findOneAndUpdate
coinSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() as any;
  if (update.$set) {
    if (update.$set.symbol) {
      update.$set.symbolLower = update.$set.symbol.toLowerCase();
    }
    if (update.$set.name) {
      update.$set.nameLower = update.$set.name.toLowerCase();
    }
  } else {
    if (update.symbol) {
      update.symbolLower = update.symbol.toLowerCase();
    }
    if (update.name) {
      update.nameLower = update.name.toLowerCase();
    }
  }
  next();
});

export const Coin = mongoose.model<ICoin>('Coin', coinSchema);

