import { NewsArticle } from '../../news/models/NewsArticle';
import { computeArticleContentHash } from '../utils/contentHash';
import {
  scoreArticleText,
  scoreToLegacySentiment,
  getModelMetadata,
} from './sentimentScorer.service';
import { getSourceTrustSync } from '../../news/services/sourceTrustRegistry.service';
import { sentimentConfig } from '../config/sentimentConfig';

export type EnrichResult = 'ready' | 'skipped' | 'not_found' | 'hash_mismatch' | 'failed';

function staleProcessingCutoff(): Date {
  return new Date(Date.now() - sentimentConfig.staleProcessingMs);
}

export async function enrichArticleByExternalId(
  externalId: string,
  expectedContentHash?: string,
  options?: { force?: boolean }
): Promise<EnrichResult> {
  const article = await NewsArticle.findOne({ externalId }).lean();
  if (!article) return 'not_found';

  const contentHash = computeArticleContentHash(article.title, article.subtitle);
  if (expectedContentHash && expectedContentHash !== contentHash) {
    return 'hash_mismatch';
  }

  if (
    !options?.force &&
    article.sentimentStatus === 'ready' &&
    article.sentimentAnalysis?.contentHash === contentHash
  ) {
    return 'skipped';
  }

  const claimFilter: Record<string, unknown> = {
    externalId,
    $or: [
      { sentimentStatus: { $in: ['pending', 'failed'] } },
      {
        sentimentStatus: 'processing',
        updatedAt: { $lt: staleProcessingCutoff() },
      },
    ],
  };

  if (options?.force) {
    delete claimFilter.$or;
  }

  const claimed = await NewsArticle.findOneAndUpdate(
    claimFilter,
    { $set: { sentimentStatus: 'processing' } },
    { new: true }
  ).lean();

  if (!claimed) {
    if (
      !options?.force &&
      article.sentimentStatus === 'ready' &&
      article.sentimentAnalysis?.contentHash === contentHash
    ) {
      return 'skipped';
    }
    return 'skipped';
  }

  try {
    const scored = scoreArticleText({
      title: article.title,
      subtitle: article.subtitle,
      sourceKey: article.source?.key,
      sourceName: article.source?.name,
    });

    const { model, modelVersion } = getModelMetadata();
    const sourceTrust = getSourceTrustSync(article.source?.key, article.source?.name);
    const analyzedAt = new Date();

    const writeResult = await NewsArticle.updateOne(
      {
        externalId,
        sentimentStatus: 'processing',
      },
      {
        $set: {
          sentimentStatus: 'ready',
          sentiment: scoreToLegacySentiment(scored.label),
          sentimentAnalysis: {
            score: scored.score,
            magnitude: scored.magnitude,
            label: scored.label,
            confidence: scored.confidence,
            model,
            modelVersion,
            analyzedAt,
            sourceTrust,
            flags: scored.flags,
            contentHash,
          },
        },
      }
    );

    if (writeResult.matchedCount === 0) {
      return 'skipped';
    }

    return 'ready';
  } catch {
    await NewsArticle.updateOne(
      { externalId, sentimentStatus: 'processing' },
      { $set: { sentimentStatus: 'failed' } }
    );
    return 'failed';
  }
}

/** Reset articles stuck in processing beyond stale threshold (worker maintenance). */
export async function recoverStaleProcessingArticles(): Promise<number> {
  const cutoff = staleProcessingCutoff();
  const result = await NewsArticle.updateMany(
    { sentimentStatus: 'processing', updatedAt: { $lt: cutoff } },
    { $set: { sentimentStatus: 'pending' } }
  );
  return result.modifiedCount;
}
