import { connectDatabase } from '../../../config/database';
import { redis } from '../../../config/redis';
import { interestProfileService } from '../services/interestProfile.service';

const STREAM = 'interest:recompute:stream';
const GROUP = 'interest-profile-workers';

export async function runInterestProfileWorker(batchSize = 10): Promise<number> {
  await connectDatabase();

  try {
    await redis.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM');
  } catch {
    /* group exists */
  }

  const messages = (await redis.xreadgroup(
    'GROUP',
    GROUP,
    'interest-worker-1',
    'COUNT',
    batchSize,
    'BLOCK',
    1000,
    'STREAMS',
    STREAM,
    '>'
  )) as [string, [string, string[]][]][] | null;

  if (!messages) return 0;

  let processed = 0;
  for (const [, entries] of messages) {
    for (const [id, fields] of entries) {
      const payloadIdx = fields.indexOf('payload');
      const raw = payloadIdx >= 0 ? fields[payloadIdx + 1] : null;
      if (!raw) continue;
      try {
        const job = JSON.parse(raw) as { userId: string };
        await interestProfileService.recompute(job.userId);
        await redis.xack(STREAM, GROUP, id);
        processed += 1;
      } catch (err) {
        console.error('[InterestProfileWorker]', err);
      }
    }
  }
  return processed;
}

export async function enqueueInterestProfileRecompute(userId: string): Promise<void> {
  await redis.xadd(
    STREAM,
    'MAXLEN',
    '~',
    '10000',
    '*',
    'payload',
    JSON.stringify({ userId, enqueuedAt: new Date().toISOString() })
  );
}

if (require.main === module) {
  runInterestProfileWorker()
    .then((n) => {
      console.log('[InterestProfileWorker] processed', n);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
