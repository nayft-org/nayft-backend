import 'dotenv/config';
import mongoose from 'mongoose';
import { connectRepairMongo, runRepairNewsCoinTags, type RepairMode } from '../src/modules/news/ingestion/repair';

function parseArgs(argv: string[]): { mode: RepairMode; externalId?: string } {
  const hasApply = argv.includes('--apply');
  const hasDry = argv.includes('--dry-run');
  if (hasApply && hasDry) {
    throw new Error('Pass either --apply or --dry-run, not both.');
  }

  const externalIdFlag = argv.indexOf('--external-id');
  const externalId =
    externalIdFlag >= 0 && argv[externalIdFlag + 1] ? String(argv[externalIdFlag + 1]).trim() : undefined;

  return {
    mode: hasApply ? 'apply' : 'dry-run',
    externalId: externalId || undefined,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await connectRepairMongo();
  try {
    const summary = await runRepairNewsCoinTags(args);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[repair-news-coin-tags] failed', err);
  process.exitCode = 1;
});
