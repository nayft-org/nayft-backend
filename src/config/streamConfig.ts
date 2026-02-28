export type KlineInterval = '1m' | '5m' | '1h' | '1d';

export const streamConfig = {
  kline: {
    symbols: (process.env.KLINE_SYMBOLS || 'BTC,ETH,BNB,SOL,XRP,ADA,DOGE,AVAX,DOT,MATIC,LINK,UNI,ATOM,LTC,BCH,NEAR,ETC,XLM,FIL,APT').split(',').map((s) => s.trim().toUpperCase()),
    recordedInterval: '1m' as KlineInterval,
    retention: {
      '1m': 7,
      '5m': 30,
      '1h': 90,
      '1d': 365,
    } as Record<KlineInterval, number>,
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
