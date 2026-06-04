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
): Promise<Array<{ id: string; job: string; stream: string }>> {
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
      return { id, job, stream };
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

export async function runPiAutoclaimPass(consumerName: string): Promise<number> {
  let claimed = 0;
  for (const stream of [piRedisKeys.recomputeHigh, piRedisKeys.recomputeStream]) {
    try {
      const raw = (await redis.call(
        'XAUTOCLAIM',
        stream,
        piConfig.consumerGroup,
        consumerName,
        String(piConfig.xautoclaimIdleMs),
        '0-0',
        'COUNT',
        String(piConfig.xautoclaimBatch)
      )) as [string, Array<[string, string[]]>, unknown[]] | null;

      if (!raw || !Array.isArray(raw[1])) continue;

      for (const [id, fieldList] of raw[1]) {
        const payloadIdx = fieldList.indexOf('payload');
        const job = payloadIdx >= 0 ? fieldList[payloadIdx + 1] : fieldList[1];
        if (!job) {
          await ackPiJob(stream, id);
          continue;
        }
        claimed += 1;
        await redis.xadd(
          stream,
          'MAXLEN',
          '~',
          String(piConfig.streamMaxLen),
          '*',
          'payload',
          job
        );
        await ackPiJob(stream, id);
      }
    } catch (err) {
      console.error('[PI Queue] XAUTOCLAIM error', stream, err);
    }
  }
  return claimed;
}
