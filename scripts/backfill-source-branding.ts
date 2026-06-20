/**
 * backfill-source-branding.ts
 *
 * Backfill domain, logoUrl, and trustCategory fields onto newsarticles.source
 * from the source_registry. Also canonicalizes source.key via alias lookups.
 *
 * Usage:
 *   npx ts-node scripts/backfill-source-branding.ts              # dry-run (default)
 *   npx ts-node scripts/backfill-source-branding.ts --apply       # write to DB
 *   npx ts-node scripts/backfill-source-branding.ts --apply --batch-size=250
 *   npx ts-node scripts/backfill-source-branding.ts --apply --resume-from-checkpoint
 *   npx ts-node scripts/backfill-source-branding.ts --apply --limit=1000
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { NewsArticle } from '../src/modules/news/models/NewsArticle';
import { SourceRegistry } from '../src/modules/news/models/SourceRegistry';
import { SourceAlias } from '../src/modules/news/models/SourceRegistry';
import { bumpNewsFeedRevision } from '../src/modules/news/newsFeedRevision';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const BATCH_SIZE = Number(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] ?? '500');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0');
const RESUME = args.includes('--resume-from-checkpoint');

const RUN_ID = `run-${Date.now()}`;
const CHECKPOINT_DIR = path.join(__dirname, '..', '.backups', 'source-branding');
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, `${DRY_RUN ? 'dryrun' : RUN_ID}`, 'checkpoint.json');

interface Checkpoint {
  runId: string;
  processedSourceKeys: string[];
  totalUpdated: number;
  startedAt: string;
}

function loadCheckpoint(): Checkpoint | null {
  if (!RESUME) return null;
  try {
    const existing = fs.readdirSync(CHECKPOINT_DIR)
      .filter((d) => !d.startsWith('dryrun'))
      .map((d) => ({ d, mtime: fs.statSync(path.join(CHECKPOINT_DIR, d)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
    if (!existing) return null;
    const file = path.join(CHECKPOINT_DIR, existing.d, 'checkpoint.json');
    const content = fs.readFileSync(file, 'utf8');
    console.info('[backfill] resuming from checkpoint:', file);
    return JSON.parse(content) as Checkpoint;
  } catch {
    return null;
  }
}

function saveCheckpoint(cp: Checkpoint): void {
  if (DRY_RUN) return;
  fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

async function main(): Promise<void> {
  console.info('[backfill-source-branding]', DRY_RUN ? 'DRY-RUN' : 'APPLY', { BATCH_SIZE, LIMIT, RESUME });

  await mongoose.connect(config.mongoUri);

  // Build registry map for quick lookup
  const allRegistryEntries = await SourceRegistry.find({}, {
    sourceKey: 1,
    sourceName: 1,
    sourceDomain: 1,
    sourceLogo: 1,
    trustCategory: 1,
  }).lean();
  const registryMap = new Map(allRegistryEntries.map((r) => [r.sourceKey, r]));
  console.info('[backfill-source-branding] registry entries loaded:', registryMap.size);

  // Build alias map for canonicalization
  const allAliases = await SourceAlias.find({}, { aliasKey: 1, sourceKey: 1 }).lean();
  const aliasMap = new Map(allAliases.map((a) => [a.aliasKey, a.sourceKey]));
  console.info('[backfill-source-branding] alias entries loaded:', aliasMap.size);

  const checkpoint = loadCheckpoint() ?? {
    runId: RUN_ID,
    processedSourceKeys: [] as string[],
    totalUpdated: 0,
    startedAt: new Date().toISOString(),
  };
  const processedSet = new Set(checkpoint.processedSourceKeys);

  // Gather distinct sourceKeys to process
  const allKeys = await NewsArticle.distinct('source.key') as string[];
  const keysToProcess = allKeys.filter((k) => !processedSet.has(k));
  const cap = LIMIT > 0 ? Math.min(LIMIT, keysToProcess.length) : keysToProcess.length;

  console.info('[backfill-source-branding] source keys to process:', cap, '/', allKeys.length);

  let totalUpdated = checkpoint.totalUpdated;
  let batchNum = 0;

  for (let i = 0; i < cap; i += BATCH_SIZE) {
    const batch = keysToProcess.slice(i, i + BATCH_SIZE);
    batchNum++;

    for (const rawKey of batch) {
      // Resolve canonical key via alias
      const canonicalKey = aliasMap.get(rawKey) ?? rawKey;
      const reg = registryMap.get(canonicalKey);

      const setFields: Record<string, unknown> = {};

      if (reg) {
        if (reg.sourceDomain) setFields['source.domain'] = reg.sourceDomain;
        if (reg.sourceLogo) setFields['source.logoUrl'] = reg.sourceLogo;
        if (reg.trustCategory) setFields['source.trustCategory'] = reg.trustCategory;
        if (reg.sourceName) setFields['source.name'] = reg.sourceName;
        if (canonicalKey !== rawKey) setFields['source.key'] = canonicalKey;
      } else {
        // Extract domain from existing article sourceUrl if registry missing
        const sample = await NewsArticle.findOne({ 'source.key': rawKey }, { sourceUrl: 1 }).lean();
        if (sample?.sourceUrl) {
          try {
            const domain = new URL(sample.sourceUrl).hostname.replace(/^www\./, '').toLowerCase();
            if (domain) setFields['source.domain'] = domain;
          } catch { /* non-fatal */ }
        }
      }

      if (Object.keys(setFields).length === 0) {
        processedSet.add(rawKey);
        continue;
      }

      if (DRY_RUN) {
        console.log('[dry-run]', rawKey, '→', canonicalKey, JSON.stringify(setFields));
      } else {
        const result = await NewsArticle.updateMany({ 'source.key': rawKey }, { $set: setFields });
        totalUpdated += result.modifiedCount;
      }

      processedSet.add(rawKey);
    }

    checkpoint.processedSourceKeys = Array.from(processedSet);
    checkpoint.totalUpdated = totalUpdated;
    saveCheckpoint(checkpoint);
    console.info(`[backfill-source-branding] batch ${batchNum} done, total updated so far: ${totalUpdated}`);
  }

  const summary = {
    runId: RUN_ID,
    dryRun: DRY_RUN,
    keysProcessed: processedSet.size,
    totalUpdated,
    completedAt: new Date().toISOString(),
  };

  console.info('[backfill-source-branding] complete', summary);

  if (!DRY_RUN) {
    await bumpNewsFeedRevision();
    const summaryPath = path.join(path.dirname(CHECKPOINT_FILE), 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.info('[backfill-source-branding] summary written to', summaryPath);
  }
}

main()
  .catch((err) => {
    console.error('[backfill-source-branding] failed', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
