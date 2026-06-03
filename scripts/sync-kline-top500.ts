/**
 * Sync top-N (default 500) market-cap symbols into Redis for kline ingestion + RRS OHLC factors.
 * Usage: npm run script:sync-kline-top500
 */
import { connectDatabase } from '../src/config/database';
import { refreshKlineSymbolsFromMarketCap } from '../src/config/klineSymbolResolver';

async function main(): Promise<void> {
  await connectDatabase();
  const symbols = await refreshKlineSymbolsFromMarketCap();
  console.log(`[sync-kline-top500] cached ${symbols.length} symbols in kline:universe:symbols:v1`);
  console.log(symbols.slice(0, 10).join(',') + (symbols.length > 10 ? '...' : ''));
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
