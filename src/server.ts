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
import { bootstrapComplianceFeatures } from './core/compliance/bootstrapComplianceFeatures';
import { bootstrapPlans } from './core/bootstrapPlans';
import { runEventWorker } from './core/event-system/eventWorker';
import { runNotificationStreamWorker } from './workers/notificationStreamWorker';
import { refreshCoinDictionary, startCoinDictionaryRefresh } from './i18n/coinDictionary';
import { runMarketSnapshotBuild } from './modules/market/snapshotBuilder';
import { startExchangePollScheduler } from './jobs/exchangePollScheduler';
import { runSentimentStreamWorker } from './modules/sentiment/jobs/sentimentWorker';
import { startCoinSentimentScheduler } from './modules/sentiment/jobs/coinSentimentScheduler';
import { startRiskBuildScheduler } from './modules/risk/jobs/riskBuildScheduler';
import { bootstrapPiFeatures } from './modules/portfolio-intelligence/bootstrapPiFeatures';
import { runPiRecomputeWorker } from './modules/portfolio-intelligence/jobs/piRecomputeWorker';
import { runCategoryCatalogSync } from './modules/portfolio-intelligence/jobs/categoryCatalogSync';
import { piConfig } from './modules/portfolio-intelligence/config/piConfig';
import { riskConfig } from './modules/risk/config/riskConfig';
import { runRiskFactorWorker } from './modules/risk/jobs/riskFactorWorker';
import {
  computeRolloutHealthScore,
} from './observability/rolloutHealthScore';
import {
  setRolloutHealthScore,
  getComplianceMetricsSnapshot,
} from './observability/complianceMetrics';
import {
  refreshRuntimeConfigSnapshot,
  startRuntimeConfigRefreshLoop,
} from './core/runtime-config/runtimeConfig.service';

/** Set when inline ticker runs; used for graceful shutdown on SIGINT/SIGTERM. */
let stopInlineTickerRef: (() => void) | null = null;
/** Stops the colocated exchange poll loop when set. */
let stopExchangePollRef: (() => void) | null = null;

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    await refreshRuntimeConfigSnapshot();
    startRuntimeConfigRefreshLoop(10_000);

    if (process.env.ENSURE_EVENTS_TTL_ON_BOOT === 'true') {
      import('./core/event-system/ensureEventsTtl')
        .then((m) => m.ensureEventsTtlIndex())
        .catch((err) => console.error('[EventsTTL] boot ensure failed', err));
    }

    setInterval(() => {
      setRolloutHealthScore(computeRolloutHealthScore());
      if (config.nodeEnv !== 'production' || Math.random() < config.perfLogSampleRate) {
        console.log('[ComplianceSnapshot]', JSON.stringify(getComplianceMetricsSnapshot()));
      }
    }, 60_000);

    await refreshCoinDictionary().catch((err) => console.error('[CoinDictionary] initial load failed', err));
    startCoinDictionaryRefresh();

    // Auto-register features from modules
    await bootstrapFeatures();
    await bootstrapComplianceFeatures();
    await bootstrapPiFeatures();

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
    if (piConfig.workerEnabled) {
      setImmediate(() =>
        runPiRecomputeWorker().catch((err) => console.error('[PI Worker] Fatal:', err))
      );
    }
    if (riskConfig.buildEnabled || riskConfig.shadowMode) {
      setImmediate(() =>
        runRiskFactorWorker().catch((err) => console.error('[RiskFactorWorker] Fatal:', err))
      );
    }
    cron.schedule('0 4 * * *', () => {
      runCategoryCatalogSync().catch((err) => console.error('[PI CategorySync]', err));
    });
    cron.schedule('0 0 * * *', () => {
      import('./modules/portfolio-intelligence/jobs/piSnapshotDaily')
        .then((m) => m.runPiSnapshotDaily())
        .catch((err) => console.error('[PI DailySnapshot]', err));
    });
    cron.schedule('0 * * * *', () => {
      import('./modules/portfolio-intelligence/jobs/piReconciliation.job')
        .then((m) => m.runPiReconciliation(200))
        .catch((err) => console.error('[PI Reconciliation]', err));
    });

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
    startRiskBuildScheduler();

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
