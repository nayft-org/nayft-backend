#!/usr/bin/env ts-node
/** Ensures TTL index on system_events.timestamp (12 months). */
import mongoose from 'mongoose';
import { connectDatabase } from '../../src/config/database';
import { SystemEvent } from '../../src/core/event-system/event.model';

async function main(): Promise<void> {
  await connectDatabase();
  await SystemEvent.collection.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 365 * 24 * 60 * 60, name: 'timestamp_12mo_ttl' }
  );
  console.log('TTL index ensured on system_events.timestamp');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
