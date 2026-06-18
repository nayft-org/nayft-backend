/**
 * rollback-source-branding.ts
 *
 * Rolls back denormalized branding fields from newsarticles.source.
 * Does NOT revert source.key canonicalization (requires alias-aware reverse map).
 *
 * Usage:
 *   npx ts-node scripts/rollback-source-branding.ts              # dry-run
 *   npx ts-node scripts/rollback-source-branding.ts --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { NewsArticle } from '../src/modules/news/models/NewsArticle';
import { bumpNewsFeedRevision } from '../src/modules/news/newsFeedRevision';

const DRY_RUN = !process.argv.includes('--apply');

async function main(): Promise<void> {
  console.info('[rollback-source-branding]', DRY_RUN ? 'DRY-RUN' : 'APPLY');
  await mongoose.connect(config.mongoUri);

  if (DRY_RUN) {
    const count = await NewsArticle.countDocuments({
      $or: [
        { 'source.domain': { $exists: true } },
        { 'source.logoUrl': { $exists: true } },
        { 'source.trustCategory': { $exists: true } },
      ],
    });
    console.info('[rollback dry-run] articles with branding fields:', count);
    console.info('[rollback dry-run] would unset source.domain, source.logoUrl, source.trustCategory');
    return;
  }

  const result = await NewsArticle.updateMany({}, {
    $unset: { 'source.domain': '', 'source.logoUrl': '', 'source.trustCategory': '' },
  });
  console.info('[rollback] unset branding fields from', result.modifiedCount, 'articles');

  await bumpNewsFeedRevision();
  console.info('[rollback] feed revision bumped');
}

main()
  .catch((err) => {
    console.error('[rollback-source-branding] failed', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
