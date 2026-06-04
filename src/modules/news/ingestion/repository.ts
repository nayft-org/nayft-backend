import { NewsArticle } from '../models';
import type { INewsArticle } from '../models/NewsArticle';
import { computeArticleContentHash } from '../../sentiment/utils/contentHash';

const WORKER_OWNED_FIELDS = new Set([
  'sentiment',
  'sentimentStatus',
  'sentimentAnalysis',
  'createdAt',
  'updatedAt',
]);

/** Guard against accidental full-document $set regressions. */
export function assertNoWorkerFieldsInSet(fields: Record<string, unknown>): void {
  for (const key of Object.keys(fields)) {
    if (WORKER_OWNED_FIELDS.has(key)) {
      throw new Error(`ingestion must not $set worker-owned field: ${key}`);
    }
  }
}

export type IngestArticleInput = Omit<INewsArticle, 'createdAt' | 'updatedAt'> & {
  contentHash?: string;
};

function pickContentFields(article: IngestArticleInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(article)) {
    if (!WORKER_OWNED_FIELDS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

export type UpsertManyResult = {
  inserted: number;
  updated: number;
  enqueueJobs: Array<{ externalId: string; contentHash: string }>;
};

export const ingestionRepository = {
  upsertByExternalId: async (article: IngestArticleInput): Promise<INewsArticle> => {
    await ingestionRepository.upsertMany([article]);
    const doc = await NewsArticle.findOne({ externalId: article.externalId }).lean<INewsArticle>();
    if (!doc) throw new Error('upsert failed');
    return doc;
  },

  upsertMany: async (articles: IngestArticleInput[]): Promise<UpsertManyResult> => {
    if (articles.length === 0) return { inserted: 0, updated: 0, enqueueJobs: [] };

    const externalIds = articles.map((a) => a.externalId);
    const existing = await NewsArticle.find({ externalId: { $in: externalIds } })
      .select('externalId sentimentAnalysis.contentHash sentimentStatus')
      .lean<Array<{ externalId: string; sentimentAnalysis?: { contentHash?: string }; sentimentStatus?: string }>>();

    const existingById = new Map(existing.map((e) => [e.externalId, e]));

    const bulkOps: Parameters<typeof NewsArticle.bulkWrite>[0] = [];
    const enqueueJobs: Array<{ externalId: string; contentHash: string }> = [];

    for (const article of articles) {
      const contentHash =
        article.contentHash ?? computeArticleContentHash(article.title, article.subtitle);
      const prev = existingById.get(article.externalId);
      const isNew = !prev;
      const hashChanged =
        !!prev && (prev.sentimentAnalysis?.contentHash ?? '') !== contentHash;

      const contentFields = pickContentFields(article);

      const $set: Record<string, unknown> = { ...contentFields };
      assertNoWorkerFieldsInSet($set);
      delete $set.metrics;
      delete $set.sentiment;
      delete $set.sentimentStatus;

      if (hashChanged) {
        $set.sentimentStatus = 'pending';
      }

      const $setOnInsert: Record<string, unknown> = {
        sentiment: 'neutral',
        metrics: article.metrics,
      };
      // Mongo rejects overlapping paths in $set and $setOnInsert even on matched updates
      if (!('sentimentStatus' in $set)) {
        $setOnInsert.sentimentStatus = 'pending';
      }

      bulkOps.push({
        updateOne: {
          filter: { externalId: article.externalId },
          update: {
            $set,
            $setOnInsert,
          },
          upsert: true,
        },
      });

      const alreadyReady =
        !isNew &&
        !hashChanged &&
        prev?.sentimentStatus === 'ready' &&
        (prev.sentimentAnalysis?.contentHash ?? '') === contentHash;

      if (!alreadyReady && (isNew || hashChanged)) {
        enqueueJobs.push({ externalId: article.externalId, contentHash });
      }
    }

    const result = await NewsArticle.bulkWrite(bulkOps);

    return {
      inserted: result.upsertedCount,
      updated: result.modifiedCount,
      enqueueJobs,
    };
  },
};
