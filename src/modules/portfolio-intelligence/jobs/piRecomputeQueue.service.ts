import { redis } from '../../../config/redis';
import { piConfig } from '../config/piConfig';
import { piRedisKeys } from '../cache/piRedisKeys';

export async function ensurePiConsumerGroup(): Promise<void> {
  for (const stream of [piRedisKeys.recomputeStream, piRedisKeys.recomputeHigh]) {
    try {
      await redis.xgroup('CREATE', stream, piConfig.consumerGroup, '0', 'MKSTREAM');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('BUSYGROUP')) throw err;
    }
  }
}

export async function readPiJobs(
  consumerName: string,
  count = 5
): Promise<Array<{ id: string; job: string }>> {
  const streams = [piRedisKeys.recomputeHigh, piRedisKeys.recomputeStream];
  for (const stream of streams) {
    const rows = await redis.xreadgroup(
      'GROUP',
      piConfig.consumerGroup,
      consumerName,
      'COUNT',
      count,
      'BLOCK',
      2000,
      'STREAMS',
      stream,
      '>'
    );
    if (!rows || rows.length === 0) continue;
    const [, messages] = rows[0] as [string, Array<[string, string[]]>];
    return messages.map(([id, fields]) => {
      const payloadIdx = fields.indexOf('payload');
      const job = payloadIdx >= 0 ? fields[payloadIdx + 1] : fields[1];
      return { id, job };
    });
  }
  return [];
}

export async function ackPiJob(stream: string, id: string): Promise<void> {
  await redis.xack(stream, piConfig.consumerGroup, id);
}

export async function moveToDlq(payload: string, reason: string): Promise<void> {
  await redis.xadd(
    piRedisKeys.recomputeDlq,
    'MAXLEN',
    '~',
    String(piConfig.dlqMaxLen),
    '*',
    'payload',
    payload,
    'reason',
    reason
  );
}
