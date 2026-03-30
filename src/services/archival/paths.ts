import path from 'path';

/** Safe directory/file segment for POSIX paths (exchange, symbol). */
export function sanitizePathSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Directory: `{root}/ohlcv/{exchange}/{interval}/{symbol}/{YYYY}/{MM}/`
 */
export function ohlcvDayDir(
  root: string,
  exchange: string,
  interval: string,
  symbol: string,
  day: Date
): string {
  const y = day.getUTCFullYear();
  const m = String(day.getUTCMonth() + 1).padStart(2, '0');
  return path.join(
    root,
    'ohlcv',
    sanitizePathSegment(exchange),
    interval,
    sanitizePathSegment(symbol),
    String(y),
    m
  );
}

/** `{SYMBOL}_{interval}_{YYYY-MM-DD}.csv` */
export function ohlcvDayFilename(symbol: string, interval: string, day: Date): string {
  const d = day.toISOString().slice(0, 10);
  return `${sanitizePathSegment(symbol)}_${interval}_${d}.csv`;
}

export function ohlcvDayPaths(
  root: string,
  exchange: string,
  interval: string,
  symbol: string,
  day: Date
): { dir: string; csvPath: string; manifestPath: string } {
  const dir = ohlcvDayDir(root, exchange, interval, symbol, day);
  const base = ohlcvDayFilename(symbol, interval, day);
  return {
    dir,
    csvPath: path.join(dir, base),
    manifestPath: path.join(dir, `${base}.manifest.json`),
  };
}
