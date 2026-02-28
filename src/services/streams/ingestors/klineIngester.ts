import type { NormalizedKlineEvent, NormalizedStreamEvent } from '../types';
import { OhlcvKline } from '../../../modules/chart/model';
import { streamConfig } from '../../../config/streamConfig';

const FLUSH_INTERVAL_MS = 1500;
const BATCH_SIZE = 300;

const buffer: NormalizedKlineEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

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

  OhlcvKline.bulkWrite(ops).catch((err) => {
    console.error('[KlineIngester] Bulk write error:', err);
    buffer.unshift(...toWrite);
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
