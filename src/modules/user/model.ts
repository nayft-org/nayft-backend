import mongoose, { Schema } from 'mongoose';
import { IUser } from '../../types';

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    followingCoins: {
      type: [String],
      default: [],
    },
    rewardPoints: {
      type: Number,
      default: 0,
    },
    preferredLanguage: {
      type: String,
      required: false,
      default: undefined,
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

export const User = mongoose.model<IUser>('User', userSchema);

