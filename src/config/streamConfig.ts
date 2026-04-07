export type KlineInterval = '1m' | '5m' | '1h' | '1d';

function parseRetentionDays(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Hot retention in MongoDB (days) — shared by KlineDownsampler and OHLCV archival. */
export const klineRetentionDays: Record<KlineInterval, number> = {
  '1m': parseRetentionDays('KLINE_RETENTION_1M_DAYS', 7),
  '5m': parseRetentionDays('KLINE_RETENTION_5M_DAYS', 30),
  '1h': parseRetentionDays('KLINE_RETENTION_1H_DAYS', 90),
  '1d': parseRetentionDays('KLINE_RETENTION_1D_DAYS', 365),
};

function parseBool(envKey: string, defaultProdFalse: boolean): boolean {
  const raw = process.env[envKey];
  if (raw !== undefined && raw !== '') return raw.toLowerCase() === 'true' || raw === '1';
  return defaultProdFalse ? (process.env.NODE_ENV || 'development') !== 'production' : true;
}

const klineDefaultList =
  'BTC,ETH,BNB,SOL,XRP,ADA,DOGE,AVAX,DOT,MATIC,LINK,UNI,ATOM,LTC,BCH,NEAR,ETC,XLM,FIL,APT';

export const streamConfig = {
  /** Baseline symbols for Binance `@ticker` when Redis symrefs are empty or unavailable. Defaults to kline list. */
  ticker: {
    baselineSymbols: (process.env.TICKER_SYMBOLS || process.env.KLINE_SYMBOLS || klineDefaultList)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  },
  kline: {
    symbols: (process.env.KLINE_SYMBOLS || klineDefaultList).split(',').map((s) => s.trim().toUpperCase()),
    recordedInterval: '1m' as KlineInterval,
    retention: klineRetentionDays,
    downsamplerCron: process.env.KLINE_DOWNSAMPLER_CRON || '0 2 * * *',
    batchSize: parseInt(process.env.KLINE_BATCH_SIZE || '500', 10),
  },
  trade: {
    symbols: (process.env.TRADE_SYMBOLS || 'BTC,ETH,BNB,SOL,XRP,ADA,DOGE,AVAX,DOT,MATIC,LINK,UNI,ATOM,LTC,BCH').split(',').map((s) => s.trim().toUpperCase()),
    retentionHours: 24,
  },
  aggTrade: {
    /** When false, only kline streams are subscribed (large CPU/bandwidth savings). Default false in production. */
    enabled: parseBool('ENABLE_AGGTRADE', true),
    /** Cap how many symbols get @aggTrade (first N after merge). */
    maxSymbols: parseInt(process.env.AGGTRADE_MAX_SYMBOLS || '14', 10),
    symbols: (process.env.AGGTRADE_SYMBOLS || 'BTC,ETH,BNB,SOL,XRP,ADA,DOGE,AVAX,DOT,MATIC,LINK,UNI,ATOM,LTC,BCH').split(',').map((s) => s.trim().toUpperCase()),
    retentionHours: 24,
  },
  exchanges: (process.env.STREAM_EXCHANGES || 'binance').split(',').map((s) => s.trim().toLowerCase()),
  /** Outbound batching interval for price WebSocket payloads (API process). */
  priceWsFlushMs: parseInt(process.env.PRICE_WS_FLUSH_MS || '150', 10),
};
