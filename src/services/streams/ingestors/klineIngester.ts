import type { NormalizedKlineEvent, NormalizedStreamEvent } from '../types';
import { OhlcvKline } from '../../../modules/chart/model';
import { streamConfig } from '../../../config/streamConfig';
import { streamMetrics } from '../../../observability/streamMetrics';

const FLUSH_INTERVAL_MS = 1500;
const BATCH_SIZE = 300;
const MAX_BUFFER = parseInt(process.env.KLINE_INGEST_MAX_BUFFER || '50000', 10);
const MAX_MONGO_REQUEUE = parseInt(process.env.KLINE_MONGO_MAX_REQUEUE || '3', 10);

const buffer: NormalizedKlineEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let mongoRequeueStreak = 0;

function capBuffer(): void {
  streamMetrics.klineBufferHighWater = Math.max(streamMetrics.klineBufferHighWater, buffer.length);
  while (buffer.length > MAX_BUFFER) {
    buffer.shift();
    streamMetrics.klineDroppedEventsTotal += 1;
  }
}

function flush(): void {
  if (buffer.length === 0) return;

  const toWrite = buffer.splice(0, BATCH_SIZE);
  const ops = toWrite
    .filter((e) => e.interval === streamConfig.kline.recordedInterval)
    .map((e) => ({
      updateOne: {
        filter: {
          'meta.exchange': e.exchange,
          'meta.symbol': e.symbol,
          'meta.interval': e.interval,
          openTime: new Date(e.openTime),
        },
        update: {
          $set: {
            meta: { exchange: e.exchange, symbol: e.symbol, interval: e.interval },
            openTime: new Date(e.openTime),
            open: e.open,
            high: e.high,
            low: e.low,
            close: e.close,
            volume: e.volume,
            quoteVolume: e.quoteVolume,
            tradeCount: e.tradeCount,
          },
        },
        upsert: true,
      },
    }));

  if (ops.length === 0) return;

  void OhlcvKline.bulkWrite(ops)
    .then(() => {
      mongoRequeueStreak = 0;
    })
    .catch((err) => {
      console.error('[KlineIngester] Bulk write error:', err);
      if (mongoRequeueStreak >= MAX_MONGO_REQUEUE) {
        streamMetrics.klineMongoRetryExhaustedTotal += toWrite.length;
        mongoRequeueStreak = 0;
        return;
      }
      mongoRequeueStreak++;
      buffer.unshift(...toWrite);
      capBuffer();
    });
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
    if (buffer.length > 0) scheduleFlush();
  }, FLUSH_INTERVAL_MS);
}

export function ingestKlineEvent(event: NormalizedStreamEvent): void {
  if (event.type !== 'kline') return;
  buffer.push(event);
  capBuffer();
  if (buffer.length >= BATCH_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush();
  } else {
    scheduleFlush();
  }
}

export async function flushKlineBuffer(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  while (buffer.length > 0) {
    flush();
    await new Promise((r) => setTimeout(r, 50));
  }
}
