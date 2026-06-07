import { z } from 'zod';

const objectIdRegex = /^[a-f0-9]{24}$/i;

export const CLIENT_EVENT_DEFINITIONS = {
  'news_feed:article_opened': z.object({
    newsId: z.string().regex(objectIdRegex),
  }),
  'auth:login_attempt': z.object({}).strict(),
  'auth:google_login_attempt': z.object({}).strict(),
  'auth:navigate_to_register': z.object({}).strict(),
} as const;

export const SERVER_EVENT_DEFINITIONS = {
  'auth:signup': z.object({}).strict(),
  'auth:login': z.object({}).strict(),
  'auth:google_login': z.object({}).strict(),
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
      if (WALLET_REGEX.test(v) || EMAIL_REGEX.test(v)) continue;
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