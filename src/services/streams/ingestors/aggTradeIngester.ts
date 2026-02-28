import type { NormalizedTradeEvent, NormalizedStreamEvent } from '../types';
import { MarketTrade } from '../../../modules/chart/model';

const FLUSH_INTERVAL_MS = 2000;
const BATCH_SIZE = 200;

const buffer: NormalizedTradeEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (buffer.length === 0) return;

  const toWrite = buffer.splice(0, BATCH_SIZE);
  const docs = toWrite.map((e) => ({
    meta: {
      exchange: e.exchange,
      symbol: e.symbol,
      dataType: 'aggTrade' as const,
    },
    time: new Date(e.time),
    price: e.price,
    quantity: e.quantity,
    quoteQuantity: e.quoteQuantity,
    tradeId: e.tradeId,
    isBuyerMaker: e.isBuyerMaker,
  }));

  MarketTrade.insertMany(docs).catch((err) => {
    console.error('[AggTradeIngester] Insert error:', err);
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

export function ingestAggTradeEvent(event: NormalizedStreamEvent): void {
  if (event.type !== 'aggTrade') return;
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
