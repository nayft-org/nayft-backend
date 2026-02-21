import mongoose, { Schema, Document } from 'mongoose';

export interface IComment extends Document {
  newsId: string;
  userId: string;
  username: string;
  parentId: string | null;
  body: string;
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    newsId: { type: String, required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    parentId: { type: String, default: null },
    body: { type: String, required: true, minlength: 1, maxlength: 500 },
    replyCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

commentSchema.index({ newsId: 1, createdAt: -1 });
commentSchema.index({ parentId: 1 });

export const Comment = mongoose.model<IComment>('Comment', commentSchema);
