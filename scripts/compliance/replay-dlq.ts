#!/usr/bin/env ts-node
/**
 * Replay events from DLQ with schema re-validation.
 * Usage: npm run script:replay-dlq -- [--dry-run] [--idempotency-key=KEY] [--limit=10]
 */
import { redis } from '../../src/config/redis';
import { redisEventQueue, EVENT_DLQ_KEY } from '../../src/core/event-system/redisEventQueue';
import { emitEventSchema } from '../../src/core/event-system/event.schema';
import { validateIncomingClientEvent } from '../../src/core/event-system/eventValidation.service';
import { getRuntimeSwitches } from '../../src/core/runtime-config/runtimeConfig.service';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const idempotencyKey = args.find((a) => a.startsWith('--idempotency-key='))?.split('=')[1];
const limit = limitArg ? parseInt(limitArg.split('=')[1] || '10', 10) : 10;

async function main(): Promise<void> {
  if (!idempotencyKey && !dryRun) {
    console.error('Refusing replay without --idempotency-key (or use --dry-run)');
    process.exit(1);
  }

  const switches = await getRuntimeSwitches();
  let replayed = 0;
  let rejected = 0;

  for (let i = 0; i < limit; i++) {
    const raw = await redis.rpop(EVENT_DLQ_KEY);
    if (!raw) break;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      rejected++;
      continue;
    }

    const schemaResult = emitEventSchema.safeParse(parsed);
    if (!schemaResult.success) {
      rejected++;
      await redis.lpush(EVENT_DLQ_KEY, raw);
      continue;
    }

    const validated = validateIncomingClientEvent(
      {
        featureKey: schemaResult.data.featureKey,
        eventType: schemaResult.data.eventType,
        userId: schemaResult.data.userId,
        metadata: schemaResult.data.metadata || {},
      },
      switches.events_schema_enforcement
    );

    if (!validated.accept) {
      rejected++;
      await redis.lpush(EVENT_DLQ_KEY, raw);
      continue;
    }

    if (!dryRun) {
      await redisEventQueue.push(validated.payload);
    }
    replayed++;
  }

  console.log(JSON.stringify({ dryRun, replayed, rejected, idempotencyKey }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
