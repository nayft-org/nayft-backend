import { emailQueue } from './email.queue';
import { emailService } from './email.service';
import { authMetrics } from '../../observability/authMetrics';

export async function runEmailWorker(): Promise<void> {
  console.log('[EmailWorker] Started');
  for (;;) {
    try {
      await emailQueue.promoteDelayed();
      const job = await emailQueue.popBlocking(5);
      if (!job) continue;
      await emailService.processJob(job);
      authMetrics.emailQueueDepth = await emailQueue.getQueueDepth();
    } catch (err) {
      console.error('[EmailWorker] Error:', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
