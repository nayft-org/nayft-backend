import { mkdtemp, readFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { writeOhlcvCsvAtomic, type CsvRow } from '../csvSink';

async function* rowsFixture(): AsyncIterable<CsvRow> {
  yield {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval: '1m',
    openTime: new Date('2025-03-01T00:00:00.000Z'),
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 100,
    quoteVolume: 150,
    tradeCount: 10,
  };
}

describe('writeOhlcvCsvAtomic', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'ohlcv-csv-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes csv and manifest and uses atomic rename', async () => {
    const finalPath = path.join(tmp, 'out', 'BTCUSDT_1m_2025-03-01.csv');
    const result = await writeOhlcvCsvAtomic(finalPath, rowsFixture());

    expect(result.rowCount).toBe(1);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.minOpenTime?.toISOString()).toBe('2025-03-01T00:00:00.000Z');

    const csv = await readFile(finalPath, 'utf8');
    expect(csv).toContain('exchange,symbol,interval,openTime');
    expect(csv).toContain('binance');
    expect(csv).toContain('BTCUSDT');

    const manPath = `${finalPath}.manifest.json`;
    const man = JSON.parse(await readFile(manPath, 'utf8'));
    expect(man.version).toBe(1);
    expect(man.rowCount).toBe(1);
  });

  it('handles empty iterator', async () => {
    async function* empty(): AsyncIterable<CsvRow> {}
    const finalPath = path.join(tmp, 'empty.csv');
    const result = await writeOhlcvCsvAtomic(finalPath, empty());
    expect(result.rowCount).toBe(0);
  });
});
