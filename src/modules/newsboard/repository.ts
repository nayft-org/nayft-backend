import { NewsBoard, INewsBoard } from './model';

export const newsBoardRepository = {
  findByUser: async (userId: string): Promise<INewsBoard[]> => {
    return NewsBoard.find({ userId }).sort({ createdAt: -1 });
  },

  findById: async (boardId: string, userId: string): Promise<INewsBoard | null> => {
    return NewsBoard.findOne({ _id: boardId, userId });
  },

  create: async (userId: string, name: string): Promise<INewsBoard> => {
    const board = new NewsBoard({ userId, name });
    return board.save();
  },

  addNewsItem: async (boardId: string, newsId: string): Promise<INewsBoard | null> => {
    return NewsBoard.findByIdAndUpdate(
      boardId,
      { $addToSet: { newsIds: newsId } },
      { new: true }
    );
  },

  removeNewsItem: async (boardId: string, newsId: string): Promise<INewsBoard | null> => {
    return NewsBoard.findByIdAndUpdate(
      boardId,
      { $pull: { newsIds: newsId } },
      { new: true }
    );
  },

  existsWithNewsInOtherBoards: async (
    userId: string,
    newsId: string,
    excludeBoardId?: string
  ): Promise<boolean> => {
    const query: Record<string, unknown> = { userId, newsIds: newsId };
    if (excludeBoardId) {
      query._id = { $ne: excludeBoardId };
    }
    return !!(await NewsBoard.exists(query));
  },
};
