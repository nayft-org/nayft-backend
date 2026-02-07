import mongoose, { Schema } from 'mongoose';
import { INews } from '../../types';

const newsSchema = new Schema<INews>(
  {
    title: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
      unique: true,
    },
    image: {
      type: String,
    },
    relatedCoins: {
      type: [String],
      default: [],
    },
    publishedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const News = mongoose.model<INews>('News', newsSchema);

