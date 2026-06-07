import mongoose, { Schema, Document } from 'mongoose';

export const REACTION_TYPES = [
  'appreciate',
  'insightful',
  'bullish',
  'risk',
  'deepDive',
  'debatable',
] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

export const TARGET_TYPES = ['news'] as const;

export type TargetType = (typeof TARGET_TYPES)[number];

export interface IReaction extends Document {
  userId: string;
  targetType: TargetType;
  targetId: string;
  type: ReactionType;
  createdAt: Date;
  updatedAt: Date;
}

const reactionSchema = new Schema<IReaction>(
  {
    userId: { type: String, required: true },
    targetType: { type: String, required: true, enum: TARGET_TYPES },
    targetId: { type: String, required: true },
    type: { type: String, required: true, enum: REACTION_TYPES },
  },
  { timestamps: true }
);

reactionSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
reactionSchema.index({ targetType: 1, targetId: 1 });
reactionSchema.index({ userId: 1, targetType: 1, updatedAt: -1 });
reactionSchema.index({ type: 1, createdAt: -1 });

export const Reaction = mongoose.model<IReaction>('Reaction', reactionSchema);
