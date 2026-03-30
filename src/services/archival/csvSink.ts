import { createWriteStream } from 'fs';
import { mkdir, rename, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const CSV_HEADER =
  'exchange,symbol,interval,openTime,open,high,low,close,volume,quoteVolume,tradeCount';

export interface CsvRow {
  exchange: string;
  symbol: string;
  interval: string;
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  tradeCount?: number;
}

function rowToLine(r: CsvRow): string {
  const qt = r.quoteVolume ?? '';
  const tc = r.tradeCount ?? '';
  return [
    r.exchange,
    r.symbol,
    r.interval,
    r.openTime.toISOString(),
    r.open,
    r.high,
    r.low,
    r.close,
    r.volume,
    qt,
    tc,
  ].join(',');
}

export interface ManifestV1 {
  version: 1;
  rowCount: number;
  minOpenTime: string;
  maxOpenTime: string;
  bytes: number;
}

/**
 * Stream CSV rows to a temp file, rename to final path (atomic), write manifest.
 */
export async function writeOhlcvCsvAtomic(
  finalCsvPath: string,
  rows: AsyncIterable<CsvRow>
): Promise<{ rowCount: number; bytes: number; minOpenTime: Date | null; maxOpenTime: Date | null }> {
  const tmpPath = `${finalCsvPath}.tmp`;
  const dir = path.dirname(finalCsvPath);
  await mkdir(dir, { recursive: true });

  try {
    await unlink(tmpPath);
  } catch {
    /* ignore */
  }

  let rowCount = 0;
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;

  const readable = Readable.from(
    (async function* () {
      yield `${CSV_HEADER}\n`;
      for await (const r of rows) {
        rowCount++;
        const t = r.openTime.getTime();
        if (t < minTs) minTs = t;
        if (t > maxTs) maxTs = t;
        yield `${rowToLine(r)}\n`;
      }
    })()
  );

  const ws = createWriteStream(tmpPath, { flags: 'w' });
  await pipeline(readable, ws);

  const st = await stat(tmpPath);
  const bytes = st.size;

  await rename(tmpPath, finalCsvPath);

  const minOpenTime =
    rowCount > 0 && Number.isFinite(minTs) ? new Date(minTs) : null;
  const maxOpenTime =
    rowCount > 0 && Number.isFinite(maxTs) ? new Date(maxTs) : null;

  const manifestPath = `${finalCsvPath}.manifest.json`;
  const manifest: ManifestV1 = {
    version: 1,
    rowCount,
    minOpenTime: minOpenTime?.toISOString() ?? '',
    maxOpenTime: maxOpenTime?.toISOString() ?? '',
    bytes,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 0), 'utf8');

  return { rowCount, bytes, minOpenTime, maxOpenTime };
}
