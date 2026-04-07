/**
 * Stream ingestion worker: Binance @ticker (dynamic), kline, optional aggTrade → Mongo + Redis pub/sub.
 * Run alongside the API (`npm run start`); see STREAMING.md.
 */
import { connectDatabase } from '../config/database';
import { registerAdapter, startStreams, stopStreams } from '../services/streams/registry';
import { BinanceKlineAdapter } from '../services/streams/adapters';
import { startBinanceTickerIngestion } from '../services/binanceTickerIngestion';

let stopTicker: (() => void) | null = null;

async function main(): Promise<void> {
  await connectDatabase();
  registerAdapter('binance', new BinanceKlineAdapter());
  startStreams();
  stopTicker = startBinanceTickerIngestion();
  console.log('[streamIngestion] Worker started (Binance ticker + kline/aggTrade)');
}

function shutdown(): void {
  if (stopTicker) {
    stopTicker();
    stopTicker = null;
  }
  stopStreams();
  process.exit(0);
}

void main().catch((err) => {
  console.error('[streamIngestion] Fatal:', err);
  process.exit(1);
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
