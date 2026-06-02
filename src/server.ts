import cron from 'node-cron';
import http from 'http';
import app from './app';
import { connectDatabase } from './config/database';
import { config } from './config/env';
import { attachWebSocketServer } from './websocket/server';
import { startBinanceTickerIngestion } from './services/binanceTickerIngestion';
import { runKlineDownsampler } from './services/streams/jobs/klineDownsampler';
import { streamConfig } from './config/streamConfig';
import { bootstrapFeatures } from './core/bootstrapFeatures';
import { bootstrapPlans } from './core/bootstrapPlans';
import { runEventWorker } from './core/event-system/eventWorker';
import { runNotificationStreamWorker } from './workers/notificationStreamWorker';
import { refreshCoinDictionary, startCoinDictionaryRefresh } from './i18n/coinDictionary';
import { runMarketSnapshotBuild } from './modules/market/snapshotBuilder';
import { startExchangePollScheduler } from './jobs/exchangePollScheduler';
import { runSentimentStreamWorker } from './modules/sentiment/jobs/sentimentWorker';
import { startCoinSentimentScheduler } from './modules/sentiment/jobs/coinSentimentScheduler';

/** Set when inline ticker runs; used for graceful shutdown on SIGINT/SIGTERM. */
let stopInlineTickerRef: (() => void) | null = null;
/** Stops the colocated exchange poll loop when set. */
let stopExchangePollRef: (() => void) | null = null;

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    await refreshCoinDictionary().catch((err) => console.error('[CoinDictionary] initial load failed', err));
    startCoinDictionaryRefresh();

    // Auto-register features from modules
    await bootstrapFeatures();

    // Seed plans if empty
    await bootstrapPlans();

    // Start event queue worker (non-blocking)
    setImmediate(() => runEventWorker().catch((err) => console.error('[EventWorker] Fatal:', err)));
    setImmediate(() =>
      runNotificationStreamWorker().catch((err) => console.error('[NotificationStreamWorker] Fatal:', err))
    );
    setImmediate(() =>
      runSentimentStreamWorker().catch((err) => console.error('[SentimentWorker] Fatal:', err))
    );

    // Create HTTP server. Price batches come from Redis (`stream:prices:batch`).
    // Inline ticker publishes to Redis so `npm run dev` alone delivers live quotes.
    // When running `dev:worker:streams` separately, set DISABLE_INLINE_TICKER_INGESTION=true to avoid duplicate Binance connections.
    const httpServer = http.createServer(app);
    attachWebSocketServer(httpServer);
    if (process.env.DISABLE_INLINE_TICKER_INGESTION === 'true') {
      stopInlineTickerRef = null;
      console.log(
        '[Server] Inline Binance ticker disabled (DISABLE_INLINE_TICKER_INGESTION); ensure stream worker is running.'
      );
    } else {
      stopInlineTickerRef = startBinanceTickerIngestion();
      console.log(
        '[Server] Inline Binance ticker ingestion started (set DISABLE_INLINE_TICKER_INGESTION=true if using npm run dev:worker:streams)'
      );
    }
    // Wallet monitoring is now driven by Alchemy/Zerion webhooks — no polling needed

    stopExchangePollRef = startExchangePollScheduler();

    startCoinSentimentScheduler();

    // Schedule KlineDownsampler (cascading aggregation)
    cron.schedule(streamConfig.kline.downsamplerCron, () => {
      runKlineDownsampler().catch((err) => console.error('[KlineDownsampler]', err));
    });
    console.log(`📊 KlineDownsampler scheduled: ${streamConfig.kline.downsamplerCron}`);

    console.log('📸 Market snapshot builder running in manual/boot mode (recurring cron disabled)');

    setImmediate(() => {
      runMarketSnapshotBuild().catch((err) => console.error('[MarketSnapshot] initial build:', err));
    });

    const port = config.port;
    const host = config.host;
    httpServer.listen(port, host, () => {
      console.log(`🚀 Server listening on http://${host}:${port}`);
      console.log(`📡 Environment: ${config.nodeEnv}`);
      console.log(`🔗 API: http://${host}:${port}/api`);
      console.log(`🔌 WebSocket: ws://${host}:${port}/ws`);
      console.log(`📈 Charts: http://${host}:${port}/api/charts/klines`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

function shutdownInlineTicker(): void {
  if (stopInlineTickerRef) {
    stopInlineTickerRef();
    stopInlineTickerRef = null;
  }
}

function shutdownExchangePoll(): void {
  if (stopExchangePollRef) {
    stopExchangePollRef();
    stopExchangePollRef = null;
  }
}

process.on('SIGINT', () => {
  shutdownInlineTicker();
  shutdownExchangePoll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdownInlineTicker();
  shutdownExchangePoll();
  process.exit(0);
});

startServer();

// this line is used to understand the commit history
// this line is used to understand the commit history
// this line is used to understand the commit history
