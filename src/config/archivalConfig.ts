import type { KlineInterval } from '../modules/chart/model';
import { klineRetentionDays } from './streamConfig';

function parsePositiveInt(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNonNegativeFloat(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 1w is not produced by the current downsampler but may exist in DB / future jobs — align with 1d. */
export function klineRetentionDaysForInterval(interval: KlineInterval | '1w'): number {
  if (interval === '1w') {
    return parsePositiveInt('KLINE_RETENTION_1W_DAYS', klineRetentionDays['1d']);
  }
  return klineRetentionDays[interval];
}

const root = (process.env.OHLCV_ARCHIVE_ROOT || '').trim();

/**
 * Disk archival for ohlcv_klines is enabled when a non-empty OHLCV_ARCHIVE_ROOT is set
 * and OHLCV_ARCHIVE_ENABLED is not the string "false".
 */
export const archivalConfig = {
  root,
  enabled: process.env.OHLCV_ARCHIVE_ENABLED !== 'false' && root.length > 0,
  /** Warn when free space is at or below this percentage (0–100). */
  diskWarnPercentFree: parseNonNegativeFloat('OHLCV_ARCHIVE_DISK_WARN_PCT', 15),
  /** Cursor batch size for Mongo reads during export. */
  cursorBatch: parsePositiveInt('OHLCV_ARCHIVE_CURSOR_BATCH', 2000),
  retentionDays: klineRetentionDaysForInterval,
};
