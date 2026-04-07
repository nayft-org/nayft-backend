import type { NormalizedTradeEvent, NormalizedStreamEvent } from '../types';
import { MarketTrade } from '../../../modules/chart/model';
import { streamMetrics } from '../../../observability/streamMetrics';

const FLUSH_INTERVAL_MS = 2000;
const BATCH_SIZE = 200;
const MAX_BUFFER = parseInt(process.env.AGGTRADE_INGEST_MAX_BUFFER || '50000', 10);
const MAX_MONGO_REQUEUE = parseInt(process.env.AGGTRADE_MONGO_MAX_REQUEUE || '3', 10);

const buffer: NormalizedTradeEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let mongoRequeueStreak = 0;

function capBuffer(): void {
  streamMetrics.aggTradeBufferHighWater = Math.max(streamMetrics.aggTradeBufferHighWater, buffer.length);
  while (buffer.length > MAX_BUFFER) {
    buffer.shift();
    streamMetrics.aggTradeDroppedEventsTotal += 1;
  }
}

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

  void MarketTrade.insertMany(docs)
    .then(() => {
      mongoRequeueStreak = 0;
    })
    .catch((err) => {
      console.error('[AggTradeIngester] Insert error:', err);
      if (mongoRequeueStreak >= MAX_MONGO_REQUEUE) {
        streamMetrics.aggTradeMongoRetryExhaustedTotal += toWrite.length;
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

export function ingestAggTradeEvent(event: NormalizedStreamEvent): void {
  if (event.type !== 'aggTrade') return;
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
