import { hostname } from 'os';
import { redis } from '../../../config/redis';
import { piConfig } from '../config/piConfig';
import { piRedisKeys } from '../cache/piRedisKeys';
import type { PiRecomputeJob } from '../contracts/piContracts';
import { ensurePiConsumerGroup, readPiJobs, moveToDlq } from './piRecomputeQueue.service';
import { piRecomputeService } from '../services/piRecompute.service';
import { connectDatabase } from '../../../config/database';

const CONSUMER = `pi-worker-${hostname()}-${process.pid}`;

async function acquireUserLock(userId: string): Promise<boolean> {
  const ok = await redis.set(piRedisKeys.lock(userId), CONSUMER, 'PX', piConfig.lockTtlMs, 'NX');
  return ok === 'OK';
}

async function releaseUserLock(userId: string): Promise<void> {
  await redis.del(piRedisKeys.lock(userId));
}

export async function runPiRecomputeWorker(): Promise<void> {
  await connectDatabase();
  await ensurePiConsumerGroup();
  console.log('[PI Worker] started', CONSUMER);

  while (true) {
    if (!piConfig.workerEnabled) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    const batch = await readPiJobs(CONSUMER, 5);
    for (const { id, job: raw } of batch) {
      let job: PiRecomputeJob;
      try {
        job = JSON.parse(raw) as PiRecomputeJob;
      } catch {
        await moveToDlq(raw, 'invalid_json');
        continue;
      }

      const locked = await acquireUserLock(job.userId);
      if (!locked) {
        continue;
      }

      try {
        await piRecomputeService.processJob(job);
        await redis.xack(piRedisKeys.recomputeStream, piConfig.consumerGroup, id).catch(() =>
          redis.xack(piRedisKeys.recomputeHigh, piConfig.consumerGroup, id)
        );
      } catch (err) {
        const attempt = (job.attempt ?? 0) + 1;
        if (attempt >= piConfig.maxRetries) {
          await moveToDlq(raw, err instanceof Error ? err.message : String(err));
        } else {
          job.attempt = attempt;
          await redis.xadd(
            piRedisKeys.recomputeStream,
            'MAXLEN',
            '~',
            String(piConfig.streamMaxLen),
            '*',
            'payload',
            JSON.stringify(job)
          );
        }
      } finally {
        await releaseUserLock(job.userId);
      }
    }
  }
}

if (require.main === module) {
  runPiRecomputeWorker().catch((err) => {
    console.error('[PI Worker] fatal', err);
    process.exit(1);
  });
}
