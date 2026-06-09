import { emailKey } from './email.config';

export const emailRedisKeys = {
  queue: emailKey('queue'),
  processingQueue: emailKey('processing'),
  delayed: emailKey('delayed'),
  dlq: emailKey('failed'),
  workerHeartbeat: emailKey('worker:heartbeat'),
  processingLock: (jobId: string) => emailKey(`processing:${jobId}`),
  replayGuard: (replayRequestId: string) => emailKey(`replay:${replayRequestId}`),
};

