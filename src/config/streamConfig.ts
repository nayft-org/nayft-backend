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

export const streamConfig = {
  kline: {
    symbols: (process.env.KLINE_SYMBOLS || 'BTC,ETH,BNB,SOL,XRP,ADA,DOGE,AVAX,DOT,MATIC,LINK,UNI,ATOM,LTC,BCH,NEAR,ETC,XLM,FIL,APT').split(',').map((s) => s.trim().toUpperCase()),
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
    symbols: (process.env.AGGTRADE_SYMBOLS || 'BTC,ETH,BNB,SOL,XRP,ADA,DOGE,AVAX,DOT,MATIC,LINK,UNI,ATOM,LTC,BCH').split(',').map((s) => s.trim().toUpperCase()),
    retentionHours: 24,
  },
  exchanges: (process.env.STREAM_EXCHANGES || 'binance').split(',').map((s) => s.trim().toLowerCase()),
};
