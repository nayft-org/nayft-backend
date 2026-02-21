import mongoose, { Schema, Document } from 'mongoose';

export interface INewsBoard extends Document {
  userId: string;
  name: string;
  newsIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const newsBoardSchema = new Schema<INewsBoard>(
  {
    userId: { type: String, required: true, ref: 'User' },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    newsIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

newsBoardSchema.index({ userId: 1 });
newsBoardSchema.index({ userId: 1, name: 1 }, { unique: true });

export const NewsBoard = mongoose.model<INewsBoard>('NewsBoard', newsBoardSchema);
