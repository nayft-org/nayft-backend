import { randomUUID } from 'crypto';

type BootPhaseStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped';

type BootPhaseRecord = {
  status: BootPhaseStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  reason?: string;
  attempts: number;
  meta?: Record<string, unknown>;
};

const bootTraceId = randomUUID();
const bootStartedAtMs = Date.now();
const phases = new Map<string, BootPhaseRecord>();
let currentPhase = 'boot_init';
let bootFailed = false;
let bootFailureReason = '';
let bootFailureStack = '';
let shutdownReason = '';

function sanitizeReason(input: string): string {
  return input
    .replace(/(token|secret|password|apikey|api_key|authorization)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

function phaseLog(level: 'START' | 'OK' | 'FAILED' | 'WARN', phase: string, extra: Record<string, unknown> = {}): void {
  const payload = {
    scope: 'boot',
    level,
    traceId: bootTraceId,
    phase,
    ts: new Date().toISOString(),
    ...extra,
  };
  const line = JSON.stringify(payload);
  if (level === 'FAILED') {
    console.error(`[BOOT][${level}] ${line}`);
    return;
  }
  if (level === 'WARN') {
    console.warn(`[BOOT][${level}] ${line}`);
    return;
  }
  console.log(`[BOOT][${level}] ${line}`);
}

export function startBootPhase(phase: string, meta: Record<string, unknown> = {}): void {
  const prev = phases.get(phase);
  const attempts = (prev?.attempts || 0) + 1;
  phases.set(phase, {
    status: 'running',
    startedAt: new Date().toISOString(),
    attempts,
    meta,
  });
  currentPhase = phase;
  phaseLog('START', phase, { attempts, meta });
}

export function completeBootPhase(phase: string, meta: Record<string, unknown> = {}): void {
  const rec = phases.get(phase);
  const started = rec?.startedAt ? Date.parse(rec.startedAt) : Date.now();
  const durationMs = Date.now() - started;
  phases.set(phase, {
    status: 'ok',
    startedAt: rec?.startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    attempts: rec?.attempts || 1,
    meta: { ...(rec?.meta || {}), ...meta },
  });
  phaseLog('OK', phase, { durationMs, meta });
}

export function failBootPhase(phase: string, err: unknown, meta: Record<string, unknown> = {}): void {
  const rec = phases.get(phase);
  const started = rec?.startedAt ? Date.parse(rec.startedAt) : Date.now();
  const durationMs = Date.now() - started;
  const reason = sanitizeReason(err instanceof Error ? err.message : String(err));
  phases.set(phase, {
    status: 'failed',
    startedAt: rec?.startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    attempts: rec?.attempts || 1,
    reason,
    meta: { ...(rec?.meta || {}), ...meta },
  });
  currentPhase = phase;
  bootFailed = true;
  bootFailureReason = reason;
  bootFailureStack = err instanceof Error ? (err.stack || '').slice(0, 2_000) : '';
  phaseLog('FAILED', phase, { durationMs, reason, meta, stack: bootFailureStack || undefined });
}

export async function withBootPhase<T>(
  phase: string,
  fn: () => Promise<T>,
  meta: Record<string, unknown> = {}
): Promise<T> {
  startBootPhase(phase, meta);
  try {
    const out = await fn();
    completeBootPhase(phase);
    return out;
  } catch (err) {
    failBootPhase(phase, err, meta);
    throw err;
  }
}

export function markBootWarn(phase: string, reason: string, meta: Record<string, unknown> = {}): void {
  phaseLog('WARN', phase, { reason: sanitizeReason(reason), meta });
}

export function markShutdown(reason: string): void {
  shutdownReason = sanitizeReason(reason);
  phaseLog('WARN', 'shutdown', { reason: shutdownReason });
}

export function getBootTraceSnapshot(): Record<string, unknown> {
  const phaseEntries = [...phases.entries()].map(([name, value]) => ({ phase: name, ...value }));
  return {
    traceId: bootTraceId,
    currentPhase,
    startupElapsedMs: Date.now() - bootStartedAtMs,
    failed: bootFailed,
    failureReason: bootFailureReason || null,
    failureStack: bootFailureStack || null,
    shutdownReason: shutdownReason || null,
    phases: phaseEntries,
  };
}

