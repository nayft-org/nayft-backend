#!/usr/bin/env ts-node
/** Backfill wallet event enrichedData via normalizer; quarantine failures. */
import mongoose from 'mongoose';
import { connectDatabase } from '../../src/config/database';
import { WalletEvent } from '../../src/modules/portfolio/models/WalletEvent';
import { normalizeEnrichedData } from '../../src/modules/portfolio/normalizers/walletEventNormalizer';
import { incrementComplianceMetric } from '../../src/observability/complianceMetrics';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1] || '500', 10) : 500;

async function main(): Promise<void> {
  await connectDatabase();
  const col = mongoose.connection.db!.collection('wallet_events_quarantine');
  await col.createIndex({ originalId: 1 }, { unique: true });

  const cursor = WalletEvent.find({ enrichedData: { $ne: null } })
    .sort({ _id: 1 })
    .limit(limit)
    .cursor();

  let sanitized = 0;
  let quarantined = 0;

  for await (const doc of cursor) {
    const raw = doc.enrichedData as Record<string, unknown> | null;
    try {
      const normalized = normalizeEnrichedData(raw);
      if (!dryRun) {
        await WalletEvent.updateOne({ _id: doc._id }, { $set: { enrichedData: normalized } });
      }
      sanitized++;
      incrementComplianceMetric('migrationSanitizeTotal');
    } catch (err) {
      quarantined++;
      incrementComplianceMetric('migrationQuarantineTotal');
      if (!dryRun) {
        await col.updateOne(
          { originalId: doc._id },
          {
            $set: {
              originalId: doc._id,
              reason: err instanceof Error ? err.message : String(err),
              payload: raw,
              migratedAt: new Date(),
            },
          },
          { upsert: true }
        );
      }
    }
  }

  console.log(JSON.stringify({ dryRun, sanitized, quarantined, limit }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
