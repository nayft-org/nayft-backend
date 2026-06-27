import { newsBoardRepository } from './repository';
import { NewsArticle } from '../news/models/NewsArticle';

export const newsBoardService = {
  getBoards: async (userId: string) => {
    const boards = await newsBoardRepository.findByUser(userId);
    return boards.map((b) => ({
      id: b._id,
      name: b.name,
      newsIds: b.newsIds,
      createdAt: b.createdAt,
    }));
  },

  createBoard: async (userId: string, name: string) => {
    if (!name || name.trim().length === 0) {
      throw new Error('Board name is required');
    }
    const board = await newsBoardRepository.create(userId, name.trim());
    return {
      id: board._id,
      name: board.name,
      newsIds: board.newsIds,
      createdAt: board.createdAt,
    };
  },

  saveItem: async (userId: string, boardId: string, newsId: string) => {
    const board = await newsBoardRepository.findById(boardId, userId);
    if (!board) {
      throw new Error('Board not found');
    }

    // Only increment global save counter on the user's first save of this article
    const alreadySavedElsewhere = await newsBoardRepository.existsWithNewsInOtherBoards(
      userId,
      newsId,
      boardId
    );
    const alreadyInThisBoard = board.newsIds.includes(newsId);

    if (!alreadySavedElsewhere && !alreadyInThisBoard) {
      await NewsArticle.updateOne(
        { externalId: newsId },
        { $inc: { 'metrics.saves': 1 } }
      );
    }

    await newsBoardRepository.addNewsItem(boardId, newsId);

    void import('../interest-profile/services/interestProfile.service')
      .then(({ interestProfileService }) =>
        interestProfileService.syncSignals(userId, { savedArticleIds: [newsId] })
      )
      .then(() =>
        import('../interest-profile/jobs/interestProfileWorker').then((m) =>
          m.enqueueInterestProfileRecompute(userId)
        )
      )
      .catch(() => {});

    const updated = await NewsArticle.findOne({ externalId: newsId }).select('metrics.saves');
    const saveCount = updated?.metrics?.saves ?? 0;

    return { saveCount, boardId };
  },

  getBoardNews: async (userId: string, boardId: string) => {
    const board = await newsBoardRepository.findById(boardId, userId);
    if (!board) {
      throw new Error('Board not found');
    }
    if (board.newsIds.length === 0) {
      return [];
    }
    const articles = await NewsArticle.find({ externalId: { $in: board.newsIds } }).sort({
      publishedAt: -1,
    });
    return articles.map((a) => ({
      id: a.externalId,
      title: a.title,
      subtitle: a.subtitle,
      imageUrl: a.imageUrl,
      sourceUrl: a.sourceUrl,
      source: a.source.name,
      publishedAt: a.publishedAt,
      categories: a.categories,
      coins: a.coins,
      metrics: a.metrics,
    }));
  },

  unsaveItem: async (userId: string, boardId: string, newsId: string) => {
    const board = await newsBoardRepository.findById(boardId, userId);
    if (!board) {
      throw new Error('Board not found');
    }

    await newsBoardRepository.removeNewsItem(boardId, newsId);

    // Decrement global counter only if article is no longer in any of the user's boards
    const stillSavedElsewhere = await newsBoardRepository.existsWithNewsInOtherBoards(
      userId,
      newsId
    );

    if (!stillSavedElsewhere) {
      await NewsArticle.updateOne(
        { externalId: newsId },
        { $inc: { 'metrics.saves': -1 } }
      );
    }

    const updated = await NewsArticle.findOne({ externalId: newsId }).select('metrics.saves');
    const saveCount = Math.max(0, updated?.metrics?.saves ?? 0);

    return { saveCount };
  },
};
