import mongoose, { Schema } from 'mongoose';

export interface IUserNewsInteraction {
  userId: string;
  newsId: string;
  liked: boolean;
  saved: boolean;
  viewed: boolean;
  createdAt: Date;
}

const userNewsInteractionSchema = new Schema<IUserNewsInteraction>(
  {
    userId: { type: String, required: true },
    newsId: { type: String, required: true },
    liked: { type: Boolean, default: false },
    saved: { type: Boolean, default: false },
    viewed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userNewsInteractionSchema.index({ userId: 1, newsId: 1 }, { unique: true });

export const UserNewsInteraction = mongoose.model<IUserNewsInteraction>(
  'UserNewsInteraction',
  userNewsInteractionSchema
);
