import mongoose, { Schema, Document } from 'mongoose';

export const FOLLOW_TARGET_TYPES = ['coin', 'user'] as const;

export type FollowTargetType = (typeof FOLLOW_TARGET_TYPES)[number];

export interface IFollow extends Document {
  followerId: string;
  targetType: FollowTargetType;
  targetId: string;
  createdAt: Date;
  updatedAt: Date;
}

const followSchema = new Schema<IFollow>(
  {
    followerId: { type: String, required: true, ref: 'User' },
    targetType: { type: String, required: true, enum: FOLLOW_TARGET_TYPES },
    targetId: { type: String, required: true },
  },
  { timestamps: true }
);

followSchema.index({ followerId: 1, targetType: 1, targetId: 1 }, { unique: true });
followSchema.index({ targetType: 1, targetId: 1 });
followSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
followSchema.index({ followerId: 1, targetType: 1, createdAt: -1 });

export const Follow = mongoose.model<IFollow>('Follow', followSchema);
