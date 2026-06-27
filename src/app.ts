import express, { Application } from 'express';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import { config } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { performanceLogMiddleware } from './middleware/performanceLog';
import { optionalJwtClaimsMiddleware } from './i18n/optionalJwtClaims';
import { resolveLanguageMiddleware } from './i18n/resolveLanguage';

// Routes
import authRoutes from './modules/auth/routes';
import marketRoutes from './modules/market/routes';
import coinRoutes from './modules/coin/routes';
import newsRoutes from './modules/news/routes';
import searchRoutes from './modules/search/routes';
import wishlistRoutes from './modules/wishlist/routes';
import rewardsRoutes from './modules/rewards/routes';
import userRoutes from './modules/user/routes';
import newsBoardRoutes from './modules/newsboard/routes';
import commentRoutes from './modules/comment/routes';
import reactionRoutes from './modules/reaction/routes';
import chartRoutes from './modules/chart/routes';
import portfolioRoutes from './modules/portfolio/routes';
import portfolioIntelligenceRoutes from './modules/portfolio-intelligence/routes';
import interestProfileRoutes from './modules/interest-profile/routes';
import feedRankingRoutes from './modules/feed-ranking/routes';
import followRoutes from './modules/follow/routes';
import onboardingRoutes from './modules/onboarding/routes';
import metricsRoutes from './modules/metrics/routes';
import notificationsRoutes, {
  notificationPreferencesRouter,
} from './modules/notifications/routes';
import deviceSessionsRoutes from './modules/notifications/deviceSessions.routes';
import { notificationsController } from './modules/notifications/controller';
import adminRoutes from './core/admin/routes';
import sentimentAdminRoutes from './modules/sentiment/adminRoutes';
import riskRoutes from './modules/risk/routes';
import riskAdminRoutes from './modules/risk/adminRoutes';
import publicFeatureRoutes from './core/public/routes';
import { authenticate } from './middlewares/auth';
import { getRedisDiagnostics, redis } from './config/redis';
import { validateEmailRuntimeConfig } from './modules/email/emailRuntimeValidation';
import { emailRedisKeys } from './modules/email/email.redisKeys';
import { getEmailWorkerRuntimeState } from './modules/email/emailWorker';
import { getBootTraceSnapshot } from './observability/bootTrace';

const app: Application = express();

function sanitizeReadinessReason(input: unknown): string {
  const raw = typeof input === 'string' ? input : input instanceof Error ? input.message : String(input ?? 'unknown');
  return raw
    .replace(/(token|secret|password|apikey|api_key|authorization)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
    .slice(0, 300);
}

// CORS Configuration
const isWildcard = config.frontendUrls.length === 1 && config.frontendUrls[0] === '*';

// When FRONTEND_URL=*, allow any origin (reflect request origin for credentials).
// Otherwise restrict to configured frontend URLs.
const corsOptions = {
  origin: isWildcard
    ? (origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) =>
        cb(null, origin ?? true)
    : config.frontendUrls,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-admin-key',
    'Accept-Language',
    'X-Portfolio-Session-Mode',
    'X-Portfolio-Trigger-Reason',
    'X-Nayft-App-Version',
    'X-Nayft-WS-Protocol',
    'X-Nayft-Schema-Version',
  ],
};

// Middleware
app.use(cors(corsOptions));
app.use(compression());
app.use(performanceLogMiddleware);
// Attach raw body buffer to req so webhook controllers can verify HMAC signatures
app.use(express.json({
  limit: '5mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// i18n: decode JWT claims without 401, then resolve target language (see production translation plan)
app.use(optionalJwtClaimsMiddleware);
app.use(resolveLanguageMiddleware);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  const startedAt = Date.now();
  const boot = getBootTraceSnapshot();
  const workerRuntime = getEmailWorkerRuntimeState();
  const requireEmailChecks =
    config.emailProvider === 'mailtrap' ||
    (process.env.EMAIL_STRICT_PROVIDER_VALIDATION || '').toLowerCase() === 'true';
  const checks: {
    mongo: boolean;
    redis: boolean;
    emailRuntime: boolean;
    emailWorkerHeartbeat: boolean;
    bootFailed: boolean;
    emailRuntimeReason: string;
    emailWorkerHeartbeatReason: string;
    redisReason?: string;
    emailWorkerId?: string;
    emailWorkerHeartbeatAt?: string;
  } = {
    mongo: mongoose.connection.readyState === 1,
    redis: false,
    emailRuntime: !requireEmailChecks,
    emailWorkerHeartbeat: !requireEmailChecks,
    bootFailed: Boolean(boot.failed),
    emailRuntimeReason: 'skipped',
    emailWorkerHeartbeatReason: 'skipped',
  };
  try {
    checks.redis = (await redis.ping()) === 'PONG';
  } catch (err) {
    checks.redis = false;
    checks.redisReason = sanitizeReadinessReason(err instanceof Error ? err.message : 'ping_failed');
  }
  if (requireEmailChecks) {
    const runtime = validateEmailRuntimeConfig();
    checks.emailRuntime = runtime.ok;
    checks.emailRuntimeReason = runtime.ok
      ? 'ok'
      : sanitizeReadinessReason(runtime.reason || 'invalid_email_runtime');
    try {
      const heartbeatRaw = await redis.get(emailRedisKeys.workerHeartbeat);
      checks.emailWorkerHeartbeat = Boolean(heartbeatRaw);
      checks.emailWorkerHeartbeatReason = heartbeatRaw ? 'ok' : 'missing';
      if (heartbeatRaw) {
        const parsed = JSON.parse(heartbeatRaw) as { workerId?: string; at?: string };
        checks.emailWorkerId = parsed.workerId || 'unknown';
        checks.emailWorkerHeartbeatAt = parsed.at || 'unknown';
      }
    } catch (err) {
      checks.emailWorkerHeartbeat = false;
      checks.emailWorkerHeartbeatReason = sanitizeReadinessReason(
        err instanceof Error ? err.message : 'heartbeat_check_failed'
      );
    }
  }
  const ok =
    checks.mongo &&
    checks.redis &&
    checks.emailRuntime &&
    checks.emailWorkerHeartbeat &&
    !checks.bootFailed;
  let failureCategory = 'READY';
  const reason =
    !checks.mongo
      ? ((failureCategory = 'READINESS_MONGO_FAILED'), 'MongoDB not connected')
      : !checks.redis
        ? ((failureCategory = 'READINESS_REDIS_FAILED'),
          `Redis check failed: ${String(checks.redisReason || 'unknown')}`)
        : !checks.emailRuntime
          ? ((failureCategory = 'READINESS_EMAIL_RUNTIME_FAILED'),
            `Email runtime invalid: ${String(checks.emailRuntimeReason || 'unknown')}`)
          : !checks.emailWorkerHeartbeat
            ? ((failureCategory = 'READINESS_WORKER_HEARTBEAT_FAILED'),
              `Email worker heartbeat missing: ${String(checks.emailWorkerHeartbeatReason || 'unknown')}`)
            : checks.bootFailed
              ? ((failureCategory = 'READINESS_BOOT_FAILED'),
                `Boot failed at ${String(boot.currentPhase)}: ${sanitizeReadinessReason(
                  String(boot.failureReason || 'unknown')
                )}`)
              : 'ok';
  const workerStatus = (() => {
    if (!requireEmailChecks) return 'not_required';
    if (checks.emailWorkerHeartbeat) return 'healthy';
    if (workerRuntime.startupStatus === 'retrying_startup') return 'retrying';
    if (workerRuntime.startupStatus === 'running') return 'running_without_heartbeat';
    return workerRuntime.startupStatus;
  })();
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ready' : 'unhealthy',
    phase: String(boot.currentPhase || 'unknown'),
    failureCategory,
    reason: sanitizeReadinessReason(reason),
    startupElapsedMs: boot.startupElapsedMs,
    readinessCheckMs: Date.now() - startedAt,
    traceId: boot.traceId,
    timestamp: new Date().toISOString(),
    bootFailure: boot.bootFailure || null,
    boot,
    redis: getRedisDiagnostics(),
    checks,
    worker: {
      initialized: workerRuntime.initialized,
      heartbeat: Boolean(checks.emailWorkerHeartbeat),
      lastHeartbeat: workerRuntime.lastHeartbeatAt,
      status: workerStatus,
      startupRetryCount: workerRuntime.startupRetryCount,
      workerId: workerRuntime.workerId || undefined,
      startupError: workerRuntime.lastStartupError
        ? sanitizeReadinessReason(workerRuntime.lastStartupError)
        : undefined,
      heartbeatError: workerRuntime.lastHeartbeatError
        ? sanitizeReadinessReason(workerRuntime.lastHeartbeatError)
        : undefined,
    },
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/newsboards', newsBoardRoutes);
app.use('/api/news', commentRoutes);
app.use('/api/news', reactionRoutes);
app.use('/api/charts', chartRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/portfolio/intelligence', portfolioIntelligenceRoutes);
app.use('/api/interest-profile', interestProfileRoutes);
app.use('/api/feed', feedRankingRoutes);
app.use('/api/follow', followRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/device-sessions', deviceSessionsRoutes);
app.use('/api/notification-preferences', notificationPreferencesRouter);
app.get('/api/notification-unread-count', authenticate, notificationsController.unreadCount);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/sentiment', sentimentAdminRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/admin/risk', riskAdminRoutes);
app.use('/api', publicFeatureRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
