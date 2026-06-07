import { z } from 'zod';

const objectIdRegex = /^[a-f0-9]{24}$/i;

export const CLIENT_EVENT_DEFINITIONS = {
  'news_feed:article_opened': z.object({
    newsId: z.string().regex(objectIdRegex),
  }),
  'auth:login_attempt': z.object({}).strict(),
  'auth:google_login_attempt': z.object({}).strict(),
  'auth:navigate_to_register': z.object({}).strict(),
  'auth:weak_password_attempt': z.object({
    strengthLevel: z.enum(['poor', 'low']),
    violationCount: z.number().int().nonnegative(),
  }),
} as const;

export const SERVER_EVENT_DEFINITIONS = {
  'auth:signup': z.object({
    passwordStrength: z.enum(['strong']).optional(),
  }).strict(),
  'auth:login': z.object({}).strict(),
  'auth:google_login': z.object({}).strict(),
  'auth:password_validation_failed': z.object({
    level: z.enum(['poor', 'low', 'strong']),
    violations: z.string().max(200),
    endpoint: z.enum(['signup', 'change-password', 'reset-password']),
  }),
  'auth:strong_password_created': z.object({
    scoreBand: z.enum(['3', '4']),
  }),
  'auth:verification_sent': z.object({
    locale: z.string().max(8),
    correlationId: z.string().max(64),
  }),
  'auth:verification_success': z.object({
    correlationId: z.string().max(64),
  }),
  'auth:verification_otp_failed': z.object({
    reason: z.enum(['invalid', 'expired', 'locked']),
    attemptNumber: z.number().int().nonnegative(),
    correlationId: z.string().max(64),
  }),
  'auth:verification_expired': z.object({
    correlationId: z.string().max(64),
  }),
  'auth:verification_resend': z.object({
    attemptNumber: z.number().int().positive(),
    correlationId: z.string().max(64),
  }),
  'auth:verification_resend_spam': z.object({
    reason: z.string().max(32),
  }),
  'auth:verification_bypass_attempt': z.object({
    routeHash: z.string().max(64),
  }),
  'auth:email_delivery_failed': z.object({
    purpose: z.string().max(32),
    correlationId: z.string().max(64),
  }),
  'auth:password_strength_rejected': z.object({
    level: z.enum(['poor', 'low', 'strong']),
    violations: z.string().max(200),
    endpoint: z.enum(['signup', 'change-password', 'reset-password']),
  }),
  'news_feed:article_viewed': z.object({
    newsId: z.string().regex(objectIdRegex),
  }),
  'portfolio_tracking:wallet_added': z.object({
    walletId: z.string().regex(objectIdRegex),
    chains: z.number().int().nonnegative(),
  }),
  'system:api_error': z.object({
    routeHash: z.string().max(64),
    errorCode: z.string().max(64),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']),
  }),
  'portfolio_intelligence_foundation:portfolio_intelligence.reconciliation_drift': z.object({
    valueDrift: z.number(),
    positionCountDrift: z.number(),
    userId: z.string().regex(objectIdRegex),
  }),
  'portfolio_intelligence_foundation:portfolio_intelligence.recompute_started': z.object({
    correlationId: z.string().max(64),
    trigger: z.string().max(32),
  }),
  'portfolio_intelligence_foundation:portfolio_intelligence.recompute_completed': z.object({
    correlationId: z.string().max(64),
    ingestRevision: z.number().int().nonnegative(),
    analyticsRevision: z.number().int().nonnegative(),
  }),
  'portfolio_intelligence_foundation:portfolio_intelligence.recompute_failed': z.object({
    correlationId: z.string().max(64),
    error: z.string().max(200),
  }),
  'news_feed:store_news_run': z.object({
    fetched: z.number().int().nonnegative(),
    stored: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    inserted: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
  }),
} as const;

export type ClientEventKey = keyof typeof CLIENT_EVENT_DEFINITIONS;
export type ServerEventKey = keyof typeof SERVER_EVENT_DEFINITIONS;

const MAX_METADATA_BYTES = 500;
const MAX_METADATA_KEYS = 10;

const WALLET_REGEX = /0x[a-fA-F0-9]{40}/;
const EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PASSWORD_LIKE_REGEX = /password|passwd|pwd/i;

export function eventRegistryKey(featureKey: string, eventType: string): string {
  return `${featureKey}:${eventType}`;
}

export function validateClientEventMetadata(
  featureKey: string,
  eventType: string,
  metadata: Record<string, unknown>
): { ok: true; metadata: Record<string, unknown> } | { ok: false; reason: string } {
  const key = eventRegistryKey(featureKey, eventType) as ClientEventKey;
  const schema = CLIENT_EVENT_DEFINITIONS[key];
  if (!schema) {
    return { ok: false, reason: `Unknown client event: ${key}` };
  }
  const bounded = boundMetadata(metadata);
  const parsed = schema.safeParse(bounded);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message || 'Invalid metadata' };
  }
  return { ok: true, metadata: parsed.data as Record<string, unknown> };
}

export function validateServerEventMetadata(
  featureKey: string,
  eventType: string,
  metadata: Record<string, unknown>,
  options?: { rejectUnknown?: boolean }
): { ok: true; metadata: Record<string, unknown> } | { ok: false; reason: string } {
  const key = eventRegistryKey(featureKey, eventType) as ServerEventKey;
  const schema = SERVER_EVENT_DEFINITIONS[key];
  if (!schema) {
    if (options?.rejectUnknown) {
      return { ok: false, reason: `Unknown server event: ${key}` };
    }
    return { ok: true, metadata: boundMetadata(metadata) };
  }
  const bounded = boundMetadata(metadata);
  const parsed = schema.safeParse(bounded);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message || 'Invalid metadata' };
  }
  return { ok: true, metadata: parsed.data as Record<string, unknown> };
}

function boundMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(metadata).slice(0, MAX_METADATA_KEYS);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = metadata[k];
    if (typeof v === 'string') {
      if (WALLET_REGEX.test(v) || EMAIL_REGEX.test(v) || PASSWORD_LIKE_REGEX.test(k)) continue;
      out[k] = v.slice(0, 200);
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v;
    }
  }
  const serialized = JSON.stringify(out);
  if (serialized.length > MAX_METADATA_BYTES) {
    throw new Error('Metadata too large');
  }
  return out;
}

export function hashRoute(path: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(path).digest('hex').slice(0, 16);
}