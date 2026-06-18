/**
 * source-inventory-aggregation.ts
 *
 * Aggregates distinct sources from newsarticles and outputs a JSON report.
 * Usage: npx ts-node scripts/source-inventory-aggregation.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { NewsArticle } from '../src/modules/news/models/NewsArticle';

function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);

  console.info('[source-inventory] connected to MongoDB');

  const rows = await (NewsArticle as any).aggregate([
    { $match: { status: 'active' } },
    {
      $group: {
        _id: { key: '$source.key', name: '$source.name' },
        articleCount: { $sum: 1 },
        hasLogo: {
          $max: {
            $cond: [{ $ifNull: ['$source.imageUrl', false] }, 1, 0],
          },
        },
        hasLogoUrl: {
          $max: {
            $cond: [{ $ifNull: ['$source.logoUrl', false] }, 1, 0],
          },
        },
        sampleUrl: { $first: '$sourceUrl' },
      },
    },
    {
      $project: {
        _id: 0,
        sourceKey: '$_id.key',
        sourceName: '$_id.name',
        articleCount: 1,
        logoExists: { $eq: ['$hasLogo', 1] },
        logoUrlExists: { $eq: ['$hasLogoUrl', 1] },
        sampleUrl: 1,
      },
    },
    { $sort: { articleCount: -1 } },
  ]);

  const report = rows.map((r: any) => ({
    sourceKey: r.sourceKey,
    sourceName: r.sourceName,
    sourceDomain: extractDomain(r.sampleUrl || ''),
    logoExists: r.logoExists,
    logoUrlExists: r.logoUrlExists,
    articleCount: r.articleCount,
    sampleUrl: r.sampleUrl,
  }));

  console.info('[source-inventory] found', report.length, 'distinct sources');
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), sources: report }, null, 2));
}

main()
  .catch((err) => {
    console.error('[source-inventory] failed', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
