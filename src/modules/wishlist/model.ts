import mongoose, { Schema } from 'mongoose';
import { IWishlist } from '../../types';

const wishlistSchema = new Schema<IWishlist>(
  {
    userId: {
      type: String,
      required: true,
      ref: 'User',
    },
    coinId: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

wishlistSchema.index({ userId: 1, coinId: 1 }, { unique: true });

export const Wishlist = mongoose.model<IWishlist>('Wishlist', wishlistSchema);

