import { ohlcvDayDir, ohlcvDayFilename, sanitizePathSegment } from '../paths';

describe('sanitizePathSegment', () => {
  it('replaces unsafe characters', () => {
    expect(sanitizePathSegment('BTC/USDT')).toBe('BTC_USDT');
    expect(sanitizePathSegment('binance')).toBe('binance');
  });
});

describe('ohlcvDayPaths layout', () => {
  it('builds nested dir and filename for UTC day', () => {
    const day = new Date(Date.UTC(2025, 2, 1)); // March 1 2025
    const dir = ohlcvDayDir('/data', 'binance', '1m', 'BTCUSDT', day);
    expect(dir).toContain('ohlcv');
    expect(dir).toContain('binance');
    expect(dir).toContain('1m');
    expect(dir).toContain('BTCUSDT');
    expect(dir).toContain('2025');
    expect(dir).toContain('03');

    const name = ohlcvDayFilename('BTCUSDT', '1m', day);
    expect(name).toBe('BTCUSDT_1m_2025-03-01.csv');
  });
});
