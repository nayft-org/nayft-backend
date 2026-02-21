import { Comment, IComment } from './model';

export const commentRepository = {
  create: async (data: {
    newsId: string;
    userId: string;
    username: string;
    parentId?: string | null;
    body: string;
  }): Promise<IComment> => {
    const comment = new Comment({
      newsId: data.newsId,
      userId: data.userId,
      username: data.username,
      parentId: data.parentId || null,
      body: data.body,
    });
    return comment.save();
  },

  findByNewsId: async (
    newsId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<IComment[]> => {
    const skip = (page - 1) * limit;
    return Comment.find({ newsId, parentId: null })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<IComment[]>();
  },

  findReplies: async (
    parentId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<IComment[]> => {
    const skip = (page - 1) * limit;
    return Comment.find({ parentId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean<IComment[]>();
  },

  findById: async (commentId: string): Promise<IComment | null> => {
    return Comment.findById(commentId);
  },

  deleteById: async (commentId: string): Promise<void> => {
    await Comment.findByIdAndDelete(commentId);
  },

  softDelete: async (commentId: string): Promise<void> => {
    await Comment.findByIdAndUpdate(commentId, { body: '[deleted]' });
  },

  incrementReplyCount: async (commentId: string, amount: number = 1): Promise<void> => {
    await Comment.findByIdAndUpdate(commentId, { $inc: { replyCount: amount } });
  },

  countByNewsId: async (newsId: string): Promise<number> => {
    return Comment.countDocuments({ newsId });
  },

  countReplies: async (commentId: string): Promise<number> => {
    return Comment.countDocuments({ parentId: commentId });
  },
};
