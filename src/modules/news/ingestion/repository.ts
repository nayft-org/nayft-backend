import { NewsArticle } from '../models';
import type { INewsArticle } from '../models/NewsArticle';

export const ingestionRepository = {
  upsertByExternalId: async (article: Omit<INewsArticle, 'createdAt' | 'updatedAt'>): Promise<INewsArticle> => {
    const result = await NewsArticle.findOneAndUpdate(
      { externalId: article.externalId },
      { $set: article },
      { new: true, upsert: true }
    );
    return result as INewsArticle;
  },

  upsertMany: async (
    articles: Omit<INewsArticle, 'createdAt' | 'updatedAt'>[]
  ): Promise<{ inserted: number; updated: number }> => {
    if (articles.length === 0) return { inserted: 0, updated: 0 };

    const bulkOps = articles.map((article) => ({
      updateOne: {
        filter: { externalId: article.externalId },
        update: { $set: article },
        upsert: true,
      },
    }));

    const result = await NewsArticle.bulkWrite(bulkOps);

    return {
      inserted: result.upsertedCount,
      updated: result.modifiedCount,
    };
  },
};
