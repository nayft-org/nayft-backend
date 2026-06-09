import { getEmailQueueAdapter } from './emailQueue.adapter';
import { emailService } from './email.service';
import { authMetrics } from '../../observability/authMetrics';
import { redis } from '../../config/redis';
import { emailRedisKeys } from './email.redisKeys';
import { emailConfig } from './email.config';
import { emailLogger } from './email.logger';

type EmailWorkerRuntimeState = {
  initialized: boolean;
  startupStatus: 'idle' | 'starting' | 'retrying_startup' | 'running';
  heartbeat: boolean;
  lastHeartbeatAt: string | null;
  lastHeartbeatError: string | null;
  workerId: string | null;
  startupRetryCount: number;
  lastStartupError: string | null;
};

const emailWorkerRuntimeState: EmailWorkerRuntimeState = {
  initialized: false,
  startupStatus: 'idle',
  heartbeat: false,
  lastHeartbeatAt: null,
  lastHeartbeatError: null,
  workerId: null,
  startupRetryCount: 0,
  lastStartupError: null,
};

export function getEmailWorkerRuntimeState(): EmailWorkerRuntimeState {
  return { ...emailWorkerRuntimeState };
}

export async function runEmailWorker(): Promise<void> {
  const workerId = `${process.pid}`;
  emailWorkerRuntimeState.initialized = true;
  emailWorkerRuntimeState.workerId = workerId;
  emailWorkerRuntimeState.startupStatus = 'starting';
  emailLogger.info('email_worker_started', { workerId });
  const queue = getEmailQueueAdapter();
  const sendHeartbeat = () =>
    redis
      .set(emailRedisKeys.workerHeartbeat, JSON.stringify({ workerId, at: new Date().toISOString() }), 'EX', emailConfig.workerHeartbeatTtlSec)
      .then(() => {
        emailWorkerRuntimeState.heartbeat = true;
        emailWorkerRuntimeState.lastHeartbeatAt = new Date().toISOString();
        emailWorkerRuntimeState.lastHeartbeatError = null;
      })
      .catch((err) => {
        emailWorkerRuntimeState.heartbeat = false;
        emailWorkerRuntimeState.lastHeartbeatError = err instanceof Error ? err.message : 'unknown';
        emailLogger.error('email_worker_heartbeat_failed', {
          workerId,
          error: err instanceof Error ? err.message : 'unknown',
        });
      });

  for (;;) {
    try {
      const restored = await queue.requeueStuckProcessing(200);
      if (restored > 0) {
        emailLogger.warn('email_worker_requeued_stuck_jobs', { workerId, restored });
      }
      break;
    } catch (err) {
      emailWorkerRuntimeState.startupStatus = 'retrying_startup';
      emailWorkerRuntimeState.startupRetryCount += 1;
      emailWorkerRuntimeState.lastStartupError = err instanceof Error ? err.message : 'unknown';
      emailLogger.error('email_worker_startup_requeue_failed', {
        workerId,
        error: err instanceof Error ? err.message : 'unknown',
      });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  try {
    await sendHeartbeat();
  } catch (err) {
    emailLogger.error('email_worker_initial_heartbeat_failed', {
      workerId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
  emailWorkerRuntimeState.startupStatus = 'running';
  emailWorkerRuntimeState.lastStartupError = null;
  const heartbeatTimer = setInterval(() => {
    void sendHeartbeat();
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
