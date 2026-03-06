import { OhlcvKline } from '../../../modules/chart/model';
import { streamConfig } from '../../../config/streamConfig';
import type { KlineInterval } from '../../../modules/chart/model';

const MS_1M = 60 * 1000;
const MS_5M = 5 * MS_1M;
const MS_1H = 60 * MS_1M;
const MS_1D = 24 * MS_1H;

function alignToBucket(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  tradeCount?: number;
}

async function aggregate1mTo5m(exchange: string, symbol: string): Promise<{ upserted: number; deleted: number }> {
  const cutoff = new Date(Date.now() - streamConfig.kline.retention['1m'] * MS_1D);
  const batchSize = streamConfig.kline.batchSize;

  const cursor = OhlcvKline.find({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': '1m',
    openTime: { $lt: cutoff },
  })
    .sort({ openTime: 1 })
    .limit(batchSize)
    .lean()
    .cursor();

  const bucketMap = new Map<number, CandleRow[]>();
  const openTimesToDelete: Date[] = [];

  for await (const doc of cursor) {
    const ts = doc.openTime.getTime();
    const bucket = alignToBucket(ts, MS_5M);
    const list = bucketMap.get(bucket) ?? [];
    list.push({
      openTime: doc.openTime,
      open: doc.open,
      high: doc.high,
      low: doc.low,
      close: doc.close,
      volume: doc.volume,
      quoteVolume: doc.quoteVolume,
      tradeCount: doc.tradeCount,
    });
    bucketMap.set(bucket, list);
    openTimesToDelete.push(doc.openTime);
  }

  if (bucketMap.size === 0) return { upserted: 0, deleted: 0 };

  const ops = [];
  for (const [bucketTs, candles] of bucketMap) {
    candles.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
    const first = candles[0];
    const last = candles[candles.length - 1];
    ops.push({
      updateOne: {
        filter: {
          'meta.exchange': exchange,
          'meta.symbol': symbol,
          'meta.interval': '5m',
          openTime: new Date(bucketTs),
        },
        update: {
          $set: {
            meta: { exchange, symbol, interval: '5m' as KlineInterval },
            openTime: new Date(bucketTs),
            open: first.open,
            high: Math.max(...candles.map((c) => c.high)),
            low: Math.min(...candles.map((c) => c.low)),
            close: last.close,
            volume: candles.reduce((s, c) => s + c.volume, 0),
            quoteVolume: candles.reduce((s, c) => s + (c.quoteVolume ?? 0), 0) || undefined,
            tradeCount: candles.reduce((s, c) => s + (c.tradeCount ?? 0), 0) || undefined,
          },
        },
        upsert: true,
      },
    });
  }

  await OhlcvKline.bulkWrite(ops);
  const deleteResult = await OhlcvKline.deleteMany({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': '1m',
    openTime: { $in: openTimesToDelete },
  });

  return { upserted: ops.length, deleted: deleteResult.deletedCount ?? 0 };
}

async function aggregate5mTo1h(exchange: string, symbol: string): Promise<{ upserted: number; deleted: number }> {
  const cutoff = new Date(Date.now() - streamConfig.kline.retention['5m'] * MS_1D);
  const batchSize = streamConfig.kline.batchSize;

  const cursor = OhlcvKline.find({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': '5m',
    openTime: { $lt: cutoff },
  })
    .sort({ openTime: 1 })
    .limit(batchSize)
    .lean()
    .cursor();

  const bucketMap = new Map<number, CandleRow[]>();
  const openTimesToDelete: Date[] = [];

  for await (const doc of cursor) {
    const ts = doc.openTime.getTime();
    const bucket = alignToBucket(ts, MS_1H);
    const list = bucketMap.get(bucket) ?? [];
    list.push({
      openTime: doc.openTime,
      open: doc.open,
      high: doc.high,
      low: doc.low,
      close: doc.close,
      volume: doc.volume,
      quoteVolume: doc.quoteVolume,
      tradeCount: doc.tradeCount,
    });
    bucketMap.set(bucket, list);
    openTimesToDelete.push(doc.openTime);
  }

  if (bucketMap.size === 0) return { upserted: 0, deleted: 0 };

  const ops = [];
  for (const [bucketTs, candles] of bucketMap) {
    candles.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
    const first = candles[0];
    const last = candles[candles.length - 1];
    ops.push({
      updateOne: {
        filter: {
          'meta.exchange': exchange,
          'meta.symbol': symbol,
          'meta.interval': '1h',
          openTime: new Date(bucketTs),
        },
        update: {
          $set: {
            meta: { exchange, symbol, interval: '1h' as KlineInterval },
            openTime: new Date(bucketTs),
            open: first.open,
            high: Math.max(...candles.map((c) => c.high)),
            low: Math.min(...candles.map((c) => c.low)),
            close: last.close,
            volume: candles.reduce((s, c) => s + c.volume, 0),
            quoteVolume: candles.reduce((s, c) => s + (c.quoteVolume ?? 0), 0) || undefined,
            tradeCount: candles.reduce((s, c) => s + (c.tradeCount ?? 0), 0) || undefined,
          },
        },
        upsert: true,
      },
    });
  }

  await OhlcvKline.bulkWrite(ops);
  const deleteResult = await OhlcvKline.deleteMany({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': '5m',
    openTime: { $in: openTimesToDelete },
  });

  return { upserted: ops.length, deleted: deleteResult.deletedCount ?? 0 };
}

async function aggregate1hTo1d(exchange: string, symbol: string): Promise<{ upserted: number; deleted: number }> {
  const cutoff = new Date(Date.now() - streamConfig.kline.retention['1h'] * MS_1D);
  const batchSize = streamConfig.kline.batchSize;

  const cursor = OhlcvKline.find({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': '1h',
    openTime: { $lt: cutoff },
  })
    .sort({ openTime: 1 })
    .limit(batchSize)
    .lean()
    .cursor();

  const bucketMap = new Map<number, CandleRow[]>();
  const openTimesToDelete: Date[] = [];

  for await (const doc of cursor) {
    const ts = doc.openTime.getTime();
    const bucket = alignToBucket(ts, MS_1D);
    const list = bucketMap.get(bucket) ?? [];
    list.push({
      openTime: doc.openTime,
      open: doc.open,
      high: doc.high,
      low: doc.low,
      close: doc.close,
      volume: doc.volume,
      quoteVolume: doc.quoteVolume,
      tradeCount: doc.tradeCount,
    });
    bucketMap.set(bucket, list);
    openTimesToDelete.push(doc.openTime);
  }

  if (bucketMap.size === 0) return { upserted: 0, deleted: 0 };

  const ops = [];
  for (const [bucketTs, candles] of bucketMap) {
    candles.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
    const first = candles[0];
    const last = candles[candles.length - 1];
    ops.push({
      updateOne: {
        filter: {
          'meta.exchange': exchange,
          'meta.symbol': symbol,
          'meta.interval': '1d',
          openTime: new Date(bucketTs),
        },
        update: {
          $set: {
            meta: { exchange, symbol, interval: '1d' as KlineInterval },
            openTime: new Date(bucketTs),
            open: first.open,
            high: Math.max(...candles.map((c) => c.high)),
            low: Math.min(...candles.map((c) => c.low)),
            close: last.close,
            volume: candles.reduce((s, c) => s + c.volume, 0),
            quoteVolume: candles.reduce((s, c) => s + (c.quoteVolume ?? 0), 0) || undefined,
            tradeCount: candles.reduce((s, c) => s + (c.tradeCount ?? 0), 0) || undefined,
          },
        },
        upsert: true,
      },
    });
  }

  await OhlcvKline.bulkWrite(ops);
  const deleteResult = await OhlcvKline.deleteMany({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': '1h',
    openTime: { $in: openTimesToDelete },
  });

  return { upserted: ops.length, deleted: deleteResult.deletedCount ?? 0 };
}

async function deleteOld1d(exchange: string, symbol: string): Promise<number> {
  const cutoff = new Date(Date.now() - streamConfig.kline.retention['1d'] * MS_1D);
  const result = await OhlcvKline.deleteMany({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': '1d',
    openTime: { $lt: cutoff },
  });
  return result.deletedCount ?? 0;
}

export async function runKlineDownsampler(): Promise<void> {
  const exchanges = streamConfig.exchanges;
  const symbols = streamConfig.kline.symbols;

  for (const exchange of exchanges) {
    for (const symbol of symbols) {
      try {
        let u1 = 0,
          d1 = 0;
        const r1 = await aggregate1mTo5m(exchange, symbol);
        u1 += r1.upserted;
        d1 += r1.deleted;
        if (r1.upserted > 0 || r1.deleted > 0) {
          const r2 = await aggregate5mTo1h(exchange, symbol);
          u1 += r2.upserted;
          d1 += r2.deleted;
          const r3 = await aggregate1hTo1d(exchange, symbol);
          u1 += r3.upserted;
          d1 += r3.deleted;
          const d4 = await deleteOld1d(exchange, symbol);
          d1 += d4;
          if (u1 > 0 || d1 > 0) {
            console.log(`[KlineDownsampler] ${exchange}/${symbol}: upserted=${u1}, deleted=${d1}`);
          }
        }
      } catch (err) {
        console.error(`[KlineDownsampler] Error for ${exchange}/${symbol}:`, err);
      }
    }
  }
}
