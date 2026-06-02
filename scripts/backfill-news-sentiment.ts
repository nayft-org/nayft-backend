/**
 * Backfill sentiment for historical newsarticles (resume-safe, rate-limited).
 *
 * Usage:
 *   SENTIMENT_ENRICHMENT_ENABLED=true npx ts-node --transpile-only scripts/backfill-news-sentiment.ts
 *   DAYS=90 LIMIT=2000 BATCH=50 SLEEP_MS=100 npx ts-node --transpile-only scripts/backfill-news-sentiment.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase } from '../src/config/database';
import { NewsArticle } from '../src/modules/news/models/NewsArticle';
import { computeArticleContentHash } from '../src/modules/sentiment/utils/contentHash';
import { enqueueSentimentJobs } from '../src/modules/sentiment/services/sentimentQueue.service';
import { sentimentConfig } from '../src/modules/sentiment/config/sentimentConfig';

async function main(): Promise<void> {
  const days = parseInt(process.env.DAYS || '90', 10);
  const limit = parseInt(process.env.LIMIT || '5000', 10);
  const batch = parseInt(process.env.BATCH || '50', 10);
  const sleepMs = parseInt(process.env.SLEEP_MS || '100', 10);
  const from = new Date(Date.now() - days * 24 * 3_600_000);

  await connectDatabase();

  if (!sentimentConfig.enrichmentEnabled) {
    console.warn('[backfill] SENTIMENT_ENRICHMENT_ENABLED is false; enabling for this run via bypass');
  }

  const cursor = NewsArticle.find({ status: 'active', publishedAt: { $gte: from } })
    .select('externalId title subtitle sentimentStatus')
    .sort({ publishedAt: -1 })
    .limit(limit)
    .cursor();

  let total = 0;
  let batchJobs: Array<{ externalId: string; contentHash: string }> = [];

  for await (const doc of cursor) {
    const contentHash = computeArticleContentHash(doc.title, doc.subtitle);
    if (doc.sentimentStatus === 'ready') continue;
    batchJobs.push({ externalId: doc.externalId, contentHash });
    if (batchJobs.length >= batch) {
      const n = await enqueueSentimentJobs(batchJobs, { bypassEnabled: true });
      total += n;
      console.log(`[backfill] enqueued ${n} (total ${total})`);
      batchJobs = [];
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }

  if (batchJobs.length > 0) {
    const n = await enqueueSentimentJobs(batchJobs, { bypassEnabled: true });
    total += n;
  }

  console.log(`[backfill] complete, enqueued ${total}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
