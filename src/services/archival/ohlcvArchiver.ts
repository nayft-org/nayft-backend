import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { OhlcvKline } from '../../modules/chart/model';
import type { KlineInterval } from '../../modules/chart/model';
import { archivalConfig } from '../../config/archivalConfig';
import { ohlcvDayPaths } from './paths';
import type { CsvRow } from './csvSink';
import { writeOhlcvCsvAtomic } from './csvSink';
import type { ManifestV1 } from './csvSink';
import { getDiskPercentFree } from './diskSpace';

const MS_1D = 24 * 60 * 60 * 1000;
const ARCHIVE_INTERVALS: Array<KlineInterval | '1w'> = ['1m', '5m', '1h', '1d', '1w'];

export interface ArchiveRunStats {
  filesWritten: number;
  rowsArchived: number;
  bytesWritten: number;
  skippedIdempotent: number;
  errorsTotal: number;
  durationMs: number;
}

function emptyStats(): ArchiveRunStats {
  return {
    filesWritten: 0,
    rowsArchived: 0,
    bytesWritten: 0,
    skippedIdempotent: 0,
    errorsTotal: 0,
    durationMs: 0,
  };
}

function logArchive(event: string, payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function readManifest(manifestPath: string): Promise<ManifestV1 | null> {
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const m = JSON.parse(raw) as ManifestV1;
    if (m && m.version === 1 && typeof m.rowCount === 'number') return m;
  } catch {
    /* ignore */
  }
  return null;
}

async function* klineDocsToCsvRows(
  exchange: string,
  symbol: string,
  interval: string,
  lower: Date,
  upper: Date
): AsyncIterable<CsvRow> {
  const cursor = OhlcvKline.find({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': interval,
    openTime: { $gte: lower, $lt: upper },
  })
    .sort({ openTime: 1 })
    .batchSize(archivalConfig.cursorBatch)
    .lean()
    .cursor();

  for await (const doc of cursor) {
    const m = doc.meta as { exchange: string; symbol: string; interval: string };
    yield {
      exchange: m.exchange,
      symbol: m.symbol,
      interval: m.interval,
      openTime: doc.openTime as Date,
      open: doc.open as number,
      high: doc.high as number,
      low: doc.low as number,
      close: doc.close as number,
      volume: doc.volume as number,
      quoteVolume: doc.quoteVolume as number | undefined,
      tradeCount: doc.tradeCount as number | undefined,
    };
  }
}

async function archiveOneUtcDay(params: {
  root: string;
  exchange: string;
  symbol: string;
  interval: string;
  dayStart: Date;
  upperExclusive: Date;
  stats: ArchiveRunStats;
}): Promise<boolean> {
  const { root, exchange, symbol, interval, dayStart, upperExclusive, stats } = params;
  if (dayStart.getTime() >= upperExclusive.getTime()) return true;

  const { csvPath, manifestPath } = ohlcvDayPaths(root, exchange, interval, symbol, dayStart);

  if (existsSync(csvPath) && existsSync(manifestPath)) {
    const man = await readManifest(manifestPath);
    if (man && man.rowCount > 0) {
      stats.skippedIdempotent++;
      logArchive('archive_skipped_idempotent', {
        exchange,
        symbol,
        interval,
        day: dayStart.toISOString().slice(0, 10),
        manifestRowCount: man.rowCount,
      });
      return true;
    }
  }

  const count = await OhlcvKline.countDocuments({
    'meta.exchange': exchange,
    'meta.symbol': symbol,
    'meta.interval': interval,
    openTime: { $gte: dayStart, $lt: upperExclusive },
  });

  if (count === 0) {
    return true;
  }

  logArchive('archive_start', {
    exchange,
    symbol,
    interval,
    day: dayStart.toISOString().slice(0, 10),
    docCount: count,
  });

  const t0 = Date.now();
  try {
    const rows = klineDocsToCsvRows(exchange, symbol, interval, dayStart, upperExclusive);
    const { rowCount, bytes } = await writeOhlcvCsvAtomic(csvPath, rows);
    stats.filesWritten++;
    stats.rowsArchived += rowCount;
    stats.bytesWritten += bytes;
    logArchive('archive_file_committed', {
      exchange,
      symbol,
      interval,
      day: dayStart.toISOString().slice(0, 10),
      rows: rowCount,
      bytes,
      durationMs: Date.now() - t0,
    });
    return true;
  } catch (err) {
    stats.errorsTotal++;
    logArchive('archive_error', {
      exchange,
      symbol,
      interval,
      day: dayStart.toISOString().slice(0, 10),
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Archives OHLCV rows older than the configured retention for each interval to CSV under `archivalConfig.root`.
 * Returns ok=false if disk is critically low or any write fails (caller should skip destructive downsampler steps).
 */
export async function archiveOhlcvForExchangeSymbol(
  exchange: string,
  symbol: string
): Promise<{ ok: boolean; stats: ArchiveRunStats }> {
  const tStart = Date.now();
  if (!archivalConfig.enabled) {
    return { ok: true, stats: { ...emptyStats(), durationMs: Date.now() - tStart } };
  }

  const root = archivalConfig.root;
  const stats = emptyStats();

  const pctFree = await getDiskPercentFree(root);
  logArchive('archive_run_start', {
    exchange,
    symbol,
    root,
    diskPercentFree: pctFree,
  });

  if (pctFree !== null && pctFree <= archivalConfig.diskWarnPercentFree) {
    logArchive('archive_disk_warn', { root, diskPercentFree: pctFree, threshold: archivalConfig.diskWarnPercentFree });
  }

  if (pctFree !== null && pctFree <= 1) {
    stats.errorsTotal++;
    stats.durationMs = Date.now() - tStart;
    logArchive('archive_aborted_disk_full', { root, diskPercentFree: pctFree });
    return { ok: false, stats };
  }

  for (const interval of ARCHIVE_INTERVALS) {
    const retentionDays = archivalConfig.retentionDays(interval);
    const cutoffMs = Date.now() - retentionDays * MS_1D;

    const bounds = await OhlcvKline.aggregate<{ min: Date | null; max: Date | null }>([
      {
        $match: {
          'meta.exchange': exchange,
          'meta.symbol': symbol,
          'meta.interval': interval,
        },
      },
      {
        $group: {
          _id: null,
          min: { $min: '$openTime' },
          max: { $max: '$openTime' },
        },
      },
    ]).exec();

    const minOpen = bounds[0]?.min ? new Date(bounds[0].min) : null;
    if (!minOpen || minOpen.getTime() >= cutoffMs) {
      continue;
    }

    let dayStart = utcDayStart(minOpen);

    while (dayStart.getTime() < cutoffMs) {
      const dayEnd = addUtcDays(dayStart, 1);
      const upperMs = Math.min(dayEnd.getTime(), cutoffMs);
      const upperExclusive = new Date(upperMs);

      const ok = await archiveOneUtcDay({
        root,
        exchange,
        symbol,
        interval,
        dayStart,
        upperExclusive,
        stats,
      });
      if (!ok) {
        stats.durationMs = Date.now() - tStart;
        return { ok: false, stats };
      }

      dayStart = dayEnd;
    }
  }

  stats.durationMs = Date.now() - tStart;
  logArchive('archive_run_complete', {
    exchange,
    symbol,
    filesWritten: stats.filesWritten,
    rowsArchived: stats.rowsArchived,
    bytesWritten: stats.bytesWritten,
    skippedIdempotent: stats.skippedIdempotent,
    errorsTotal: stats.errorsTotal,
    durationMs: stats.durationMs,
  });

  return { ok: stats.errorsTotal === 0, stats };
}
