import { commentRepository } from './repository';
import { NewsArticle } from '../news/models/NewsArticle';
import { User } from '../user/model';

const mapComment = (c: any) => ({
  id: c._id,
  newsId: c.newsId,
  userId: c.userId,
  username: c.username,
  parentId: c.parentId,
  body: c.body,
  replyCount: c.replyCount,
  createdAt: c.createdAt,
});

export const commentService = {
  getComments: async (newsId: string, page: number = 1, limit: number = 20) => {
    const comments = await commentRepository.findByNewsId(newsId, page, limit);
    return comments.map(mapComment);
  },

  getReplies: async (commentId: string, page: number = 1, limit: number = 10) => {
    const replies = await commentRepository.findReplies(commentId, page, limit);
    return replies.map(mapComment);
  },

  addComment: async (
    newsId: string,
    userId: string,
    body: string,
    parentId?: string | null
  ) => {
    if (!body || body.trim().length === 0) {
      throw new Error('Comment body is required');
    }
    if (body.trim().length > 500) {
      throw new Error('Comment must be 500 characters or fewer');
    }

    const user = await User.findById(userId).select('username');
    if (!user) {
      throw new Error('User not found');
    }

    if (parentId) {
      const parent = await commentRepository.findById(parentId);
      if (!parent || parent.newsId !== newsId) {
        throw new Error('Parent comment not found');
      }
    }

    const comment = await commentRepository.create({
      newsId,
      userId,
      username: user.username,
      parentId: parentId || null,
      body: body.trim(),
    });

    await NewsArticle.updateOne(
      { externalId: newsId },
      { $inc: { 'metrics.comments': 1 } }
    );

    if (parentId) {
      await commentRepository.incrementReplyCount(parentId, 1);
    }

    const updated = await NewsArticle.findOne({ externalId: newsId }).select('metrics.comments');
    const commentCount = updated?.metrics?.comments ?? 0;

    return { comment: mapComment(comment), commentCount };
  },

  deleteComment: async (newsId: string, commentId: string, userId: string) => {
    const comment = await commentRepository.findById(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }
    if (comment.userId !== userId) {
      throw new Error('Not authorized to delete this comment');
    }
    if (comment.newsId !== newsId) {
      throw new Error('Comment does not belong to this article');
    }

    const hasReplies = comment.replyCount > 0;

    if (hasReplies) {
      await commentRepository.softDelete(commentId);
    } else {
      await commentRepository.deleteById(commentId);

      if (comment.parentId) {
        await commentRepository.incrementReplyCount(comment.parentId, -1);
      }
    }

    await NewsArticle.updateOne(
      { externalId: newsId },
      { $inc: { 'metrics.comments': -1 } }
    );

    const updated = await NewsArticle.findOne({ externalId: newsId }).select('metrics.comments');
    const commentCount = Math.max(0, updated?.metrics?.comments ?? 0);

    return { commentCount };
  },
};
