#!/usr/bin/env ts-node
/**
 * Chunked migration for historical system_events metadata.
 * Usage: npm run script:migrate-system-events -- [--dry-run] [--limit=500]
 */
import mongoose from 'mongoose';
import { connectDatabase } from '../../src/config/database';
import { SystemEvent } from '../../src/core/event-system/event.model';
import { SystemEventQuarantine } from '../../src/core/event-system/systemEventQuarantine.model';
import { validateServerEventMetadata } from '../../src/core/event-system/eventRegistry';
import { incrementComplianceMetric } from '../../src/observability/complianceMetrics';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1] || '500', 10) : 500;

async function main(): Promise<void> {
  await connectDatabase();
  const cursor = SystemEvent.find({ complianceMigrationVersion: { $ne: 1 } })
    .sort({ _id: 1 })
    .limit(limit)
    .cursor();

  let sanitized = 0;
  let quarantined = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const result = validateServerEventMetadata(doc.featureKey, doc.eventType, doc.metadata || {});
    if (!result.ok) {
      quarantined++;
      incrementComplianceMetric('migrationQuarantineTotal');
      if (!dryRun) {
        await SystemEventQuarantine.updateOne(
          { originalId: doc._id },
          {
            $set: {
              originalId: doc._id,
              featureKey: doc.featureKey,
              eventType: doc.eventType,
              reason: result.reason,
              payload: doc.metadata || {},
              migratedAt: new Date(),
              complianceMigrationVersion: -1,
            },
          },
          { upsert: true }
        );
        await SystemEvent.updateOne(
          { _id: doc._id },
          { $set: { complianceMigrationVersion: -1 } }
        );
      }
      continue;
    }
    if (!dryRun) {
      await SystemEvent.updateOne(
        { _id: doc._id },
        { $set: { metadata: result.metadata, complianceMigrationVersion: 1 } }
      );
    }
    sanitized++;
    incrementComplianceMetric('migrationSanitizeTotal');
  }

  console.log(JSON.stringify({ dryRun, sanitized, quarantined, skipped, limit }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
