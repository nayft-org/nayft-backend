import { hostname } from 'os';
import { redis } from '../../../config/redis';
import { piConfig } from '../config/piConfig';
import { piRedisKeys } from '../cache/piRedisKeys';
import type { PiRecomputeJob } from '../contracts/piContracts';
import {
  ensurePiConsumerGroup,
  readPiJobs,
  moveToDlq,
  ackPiJob,
  runPiAutoclaimPass,
} from './piRecomputeQueue.service';
import { piRecomputeService } from '../services/piRecompute.service';
import { connectDatabase } from '../../../config/database';
import { getRuntimeSwitches } from '../../../core/runtime-config/runtimeConfig.service';
import { userRepository } from '../../user/repository';
import { incrementComplianceMetric } from '../../../observability/complianceMetrics';

const CONSUMER = `pi-worker-${hostname()}-${process.pid}`;
let lastAutoclaimAt = 0;

async function acquireUserLock(userId: string): Promise<boolean> {
  const ok = await redis.set(piRedisKeys.lock(userId), CONSUMER, 'PX', piConfig.lockTtlMs, 'NX');
  return ok === 'OK';
}

async function releaseUserLock(userId: string): Promise<void> {
  await redis.del(piRedisKeys.lock(userId));
}

async function requeueWithBackoff(job: PiRecomputeJob, stream: string): Promise<void> {
  const attempt = (job.attempt ?? 0) + 1;
  job.attempt = attempt;
  const delayMs = attempt === 1 ? 5000 : attempt === 2 ? 30000 : 120000;
  await new Promise((r) => setTimeout(r, Math.min(delayMs, 5000)));
  await redis.xadd(
    stream,
    'MAXLEN',
    '~',
    String(piConfig.streamMaxLen),
    '*',
    'payload',
    JSON.stringify(job)
  );
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

    const now = Date.now();
    if (now - lastAutoclaimAt >= 60_000) {
      lastAutoclaimAt = now;
      await runPiAutoclaimPass(CONSUMER);
    }

    const batch = await readPiJobs(CONSUMER, 5);
    for (const { id, job: raw, stream } of batch) {
      let job: PiRecomputeJob;
      try {
        job = JSON.parse(raw) as PiRecomputeJob;
      } catch {
        await moveToDlq(raw, 'invalid_json');
        await ackPiJob(stream, id);
        continue;
      }

      if (!job.userId || !job.jobSchemaVersion) {
        await moveToDlq(raw, 'invalid_schema');
        await ackPiJob(stream, id);
        continue;
      }

      const switches = await getRuntimeSwitches();
      if (!switches.pi_recompute_enqueue_enabled || switches.personalization_globally_disabled) {
        await ackPiJob(stream, id);
        incrementComplianceMetric('personalizationDisabledTotal');
        continue;
      }
      const userEnabled = await userRepository.getPersonalizationEnabled(job.userId);
      if (!userEnabled) {
        await ackPiJob(stream, id);
        incrementComplianceMetric('personalizationDisabledTotal');
        continue;
      }

      const locked = await acquireUserLock(job.userId);
      if (!locked) {
        await ackPiJob(stream, id);
        await requeueWithBackoff(job, stream);
        continue;
      }

      try {
        await piRecomputeService.processJob(job);
        await ackPiJob(stream, id);
      } catch (err) {
        const attempt = (job.attempt ?? 0) + 1;
        await ackPiJob(stream, id);
        if (attempt >= piConfig.maxRetries) {
          await moveToDlq(raw, err instanceof Error ? err.message : String(err));
        } else {
          await requeueWithBackoff(job, stream);
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
