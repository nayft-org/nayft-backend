import mongoose, { Schema } from 'mongoose';
import { IRewardsActivity } from '../../types';

const rewardsActivitySchema = new Schema<IRewardsActivity>(
  {
    userId: {
      type: String,
      required: true,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
    },
    points: {
      type: Number,
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

export const RewardsActivity = mongoose.model<IRewardsActivity>('RewardsActivity', rewardsActivitySchema);

