import { getEmailQueueAdapter } from './emailQueue.adapter';
import { emailService } from './email.service';
import { authMetrics } from '../../observability/authMetrics';
import { redis } from '../../config/redis';
import { emailRedisKeys } from './email.redisKeys';
import { emailConfig } from './email.config';
import { emailLogger } from './email.logger';

export async function runEmailWorker(): Promise<void> {
  const workerId = `${process.pid}`;
  emailLogger.info('email_worker_started', { workerId });
  const queue = getEmailQueueAdapter();
  const restored = await queue.requeueStuckProcessing(200);
  if (restored > 0) {
    emailLogger.warn('email_worker_requeued_stuck_jobs', { workerId, restored });
  }
  const heartbeatTimer = setInterval(() => {
    redis
      .set(emailRedisKeys.workerHeartbeat, JSON.stringify({ workerId, at: new Date().toISOString() }), 'EX', emailConfig.workerHeartbeatTtlSec)
      .catch((err) => {
        emailLogger.error('email_worker_heartbeat_failed', {
          workerId,
          error: err instanceof Error ? err.message : 'unknown',
        });
      });
  }, emailConfig.workerHeartbeatRefreshMs);
  for (;;) {
    try {
      await queue.promoteDelayed();
      const popped = await queue.popBlocking(5);
      if (!popped) continue;
      await emailService.processJob(popped.job, popped.raw);
      authMetrics.emailQueueDepth = await queue.getQueueDepth();
      authMetrics.emailProcessingDepth = await queue.getProcessingDepth();
    } catch (err) {
      emailLogger.error('email_worker_error', {
        workerId,
        error: err instanceof Error ? err.message : 'unknown',
      });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  clearInterval(heartbeatTimer);
}
