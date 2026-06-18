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
import { redis } from './config/redis';
import { emailRedisKeys } from './modules/email/email.redisKeys';

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

function bootLog(message: string, meta: Record<string, unknown> = {}): void {
  console.log(`[BOOT] ${message} ${JSON.stringify(meta)}`);
}

async function waitForEmailWorkerHeartbeat(timeoutMs: number): Promise<{ ok: boolean; detectedAfterMs: number }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const heartbeat = await redis.get(emailRedisKeys.workerHeartbeat);
      if (heartbeat) {
        return { ok: true, detectedAfterMs: Date.now() - startedAt };
      }
    } catch {
      // retry until timeout
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, detectedAfterMs: Date.now() - startedAt };
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
  const bootStartedAt = Date.now();
  bootLog('Starting backend', { nodeEnv: config.nodeEnv, pid: process.pid });
  try {
    bootLog('Loading environment variables');
    await withBootPhase('env_validation', async () => {
      assertEmailRuntimeConfigOrThrow();
    });
    bootLog('Environment validation passed');

    bootLog('Connecting MongoDB');
    const mongoStartedAt = Date.now();
    await withBootPhase('mongo_connect', async () => {
      await connectDatabase();
    });
    bootLog('MongoDB connected', { durationMs: Date.now() - mongoStartedAt });

    bootLog('Connecting Redis');
    const redisStartedAt = Date.now();
    await withBootPhase('redis_connectivity_check', async () => {
      const pong = await redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected Redis ping response: ${pong}`);
      }
    });
    bootLog('Redis connected', { durationMs: Date.now() - redisStartedAt });

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
      bootLog('Registering routes and features');
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
    bootLog('Initializing workers');
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
    const heartbeatCheck = await waitForEmailWorkerHeartbeat(30_000);
    if (heartbeatCheck.ok) {
      bootLog('Email worker initialized', { heartbeatDetectedAfterMs: heartbeatCheck.detectedAfterMs });
    } else {
      markBootWarn('worker_email_heartbeat', 'email worker heartbeat not detected during startup window', {
        heartbeatDetectedAfterMs: heartbeatCheck.detectedAfterMs,
      });
      bootLog('Email worker heartbeat pending', { heartbeatDetectedAfterMs: heartbeatCheck.detectedAfterMs });
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
    bootLog('Starting HTTP server');
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

    // Source branding repair jobs
    cron.schedule('0 */6 * * *', () => {
      import('./modules/news/services/sourceRepair.service')
        .then(async (m) => {
          await m.enqueueMissingLogoRepairs(50);
          await m.runRepairBatch('logo', 50);
        })
        .catch((err) => console.error('[SourceRepair:logos]', err));
    });
    cron.schedule('30 */6 * * *', () => {
      import('./modules/news/services/sourceRepair.service')
        .then(async (m) => {
          await m.enqueueMissingDomainRepairs();
          await m.runRepairBatch('domain', 50);
        })
        .catch((err) => console.error('[SourceRepair:domains]', err));
    });
    cron.schedule('0 2 * * *', () => {
      import('./modules/news/services/sourceRepair.service')
        .then(async (m) => {
          await m.enqueueMissingTrustRepairs();
          await m.runRepairBatch('trust', 50);
        })
        .catch((err) => console.error('[SourceRepair:trust]', err));
    });
    cron.schedule('0 3 * * *', () => {
      import('./modules/news/services/sourceConsistencyValidator.service')
        .then((m) => m.runConsistencyValidator())
        .catch((err) => console.error('[SourceConsistency]', err));
    });
    cron.schedule('0 1 * * *', () => {
      import('./modules/news/services/sourceRegistry.service')
        .then((m) => m.refreshArticleCounts())
        .catch((err) => console.error('[SourceRegistry:articleCounts]', err));
    });

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
      bootLog('Backend ready', { startupDurationMs: Date.now() - bootStartedAt, host, port });
      completeBootPhase('boot_start', { host, port, nodeEnv: config.nodeEnv });
    });
  } catch (error) {
    failBootPhase('boot_start', error, { reason: sanitizeFatal(error) });
    console.error('[BOOT][FAILED]', JSON.stringify({
      phase: 'boot_start',
      reason: sanitizeFatal(error),
      startupDurationMs: Date.now() - bootStartedAt,
    }));
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
