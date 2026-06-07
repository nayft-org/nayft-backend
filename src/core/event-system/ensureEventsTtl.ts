import { SystemEvent } from './event.model';

/** Idempotent TTL index on system_events.timestamp (12 months). */
export async function ensureEventsTtlIndex(): Promise<void> {
  await SystemEvent.collection.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 365 * 24 * 3600, name: 'timestamp_ttl_12mo' }
  );
}
