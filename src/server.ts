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
import { bootstrapAuthVerificationFeatures } from './modules/auth/bootstrapAuthFeatures';
import { runEmailWorker } from './modules/email/emailWorker';
import { authRepository } from './modules/auth/repository';
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
import { assertEmailRuntimeConfigOrThrow } from './modules/email/emailRuntimeValidation';
import {
  completeBootPhase,
  failBootPhase,
  markBootWarn,
  markShutdown,
  startBootPhase,
  withBootPhase,
} from './observability/bootTrace';
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

function sanitizeFatal(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/(token|secret|password|apikey|api_key|authorization)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

process.on('unhandledRejection', (reason) => {
  failBootPhase('unhandled_rejection', reason, { reason: sanitizeFatal(reason) });
});

process.on('uncaughtException', (err) => {
  failBootPhase('uncaught_exception', err, { reason: sanitizeFatal(err) });
  process.exit(1);
});

const startServer = async (): Promise<void> => {
  startBootPhase('boot_start', { nodeEnv: config.nodeEnv, pid: process.pid });
  try {
    await withBootPhase('env_validation', async () => {
      assertEmailRuntimeConfigOrThrow();
    });

    await withBootPhase('mongo_connect', async () => {
      await connectDatabase();
    });

    await withBootPhase('runtime_config_init', async () => {
      await refreshRuntimeConfigSnapshot();
      startRuntimeConfigRefreshLoop(10_000);
    });

    if (process.env.ENSURE_EVENTS_TTL_ON_BOOT === 'true') {
      import('./core/event-system/ensureEventsTtl')
        .then((m) => m.ensureEventsTtlIndex())
        .catch((err) => {
          markBootWarn('events_ttl_boot', err instanceof Error ? err.message : String(err));
          console.error('[EventsTTL] boot ensure failed', err);
        });
    }

    setInterval(() => {
      setRolloutHealthScore(computeRolloutHealthScore());
      if (config.nodeEnv !== 'production' || Math.random() < config.perfLogSampleRate) {
        console.log('[ComplianceSnapshot]', JSON.stringify(getComplianceMetricsSnapshot()));
      }
    }, 60_000);

    await withBootPhase('coin_dictionary_init', async () => {
      await refreshCoinDictionary();
      startCoinDictionaryRefresh();
    }).catch((err) => {
      markBootWarn('coin_dictionary_init', err instanceof Error ? err.message : String(err));
    });

    await withBootPhase('feature_bootstrap', async () => {
      await bootstrapFeatures();
      await bootstrapAuthVerificationFeatures();
      const grandfathered = await authRepository.grandfatherExistingUsers();
      if (grandfathered > 0) {
        console.log(`[Auth] Grandfathered ${grandfathered} existing users as emailVerified`);
      }
      await bootstrapComplianceFeatures();
      await bootstrapPiFeatures();
    });

    await withBootPhase('plan_bootstrap', async () => {
      await bootstrapPlans();
    });

    // Start event queue worker (non-blocking)
    startBootPhase('worker_init');
    setImmediate(() => runEventWorker().catch((err) => {
      failBootPhase('worker_event', err);
      console.error('[EventWorker] Fatal:', err);
    }));
    setImmediate(() => runEmailWorker().catch((err) => {
      failBootPhase('worker_email', err);
      console.error('[EmailWorker] Fatal:', err);
    }));
    setImmediate(() =>
      runNotificationStreamWorker().catch((err) => {
        failBootPhase('worker_notification_stream', err);
        console.error('[NotificationStreamWorker] Fatal:', err);
      })
    );
    setImmediate(() =>
      runSentimentStreamWorker().catch((err) => {
        failBootPhase('worker_sentiment', err);
        console.error('[SentimentWorker] Fatal:', err);
      })
    );
    if (piConfig.workerEnabled) {
      setImmediate(() =>
        runPiRecomputeWorker().catch((err) => {
          failBootPhase('worker_pi_recompute', err);
          console.error('[PI Worker] Fatal:', err);
        })
      );
    }
    if (riskConfig.buildEnabled || riskConfig.shadowMode) {
      setImmediate(() =>
        runRiskFactorWorker().catch((err) => {
          failBootPhase('worker_risk_factor', err);
          console.error('[RiskFactorWorker] Fatal:', err);
        })
      );
    }
    completeBootPhase('worker_init');
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
    const httpServer = await withBootPhase('http_server_init', async () => {
      const server = http.createServer(app);
      attachWebSocketServer(server);
      return server;
    });
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
    startBootPhase('http_listen');
    httpServer.listen(port, host, () => {
      completeBootPhase('http_listen', { host, port });
      console.log(`🚀 Server listening on http://${host}:${port}`);
      console.log(`📡 Environment: ${config.nodeEnv}`);
      console.log(`🔗 API: http://${host}:${port}/api`);
      console.log(`🔌 WebSocket: ws://${host}:${port}/ws`);
      console.log(`📈 Charts: http://${host}:${port}/api/charts/klines`);
      completeBootPhase('boot_start', { host, port, nodeEnv: config.nodeEnv });
    });
  } catch (error) {
    failBootPhase('boot_start', error, { reason: sanitizeFatal(error) });
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
  markShutdown('SIGINT');
  shutdownInlineTicker();
  shutdownExchangePoll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  markShutdown('SIGTERM');
  shutdownInlineTicker();
  shutdownExchangePoll();
  process.exit(0);
});

startServer();

// this line is used to understand the commit history
// this line is used to understand the commit history
// this line is used to understand the commit history
