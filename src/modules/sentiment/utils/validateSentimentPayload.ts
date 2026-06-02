import { sentimentConfig } from '../config/sentimentConfig';
import type { SentimentJobPayload } from '../services/sentimentQueue.service';

const EXTERNAL_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const CONTENT_HASH_RE = /^[a-f0-9]{32}$/;

export type PayloadValidationResult =
  | { ok: true; job: SentimentJobPayload }
  | { ok: false; reason: string };

export function validateSentimentJobPayload(raw: string): PayloadValidationResult {
  if (raw.length > sentimentConfig.maxPayloadBytes) {
    return { ok: false, reason: 'payload_too_large' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'invalid_shape' };
  }

  const o = parsed as Record<string, unknown>;
  const externalId = o.externalId;
  const contentHash = o.contentHash;
  const queuedAt = o.queuedAt;

  if (typeof externalId !== 'string' || !EXTERNAL_ID_RE.test(externalId)) {
    return { ok: false, reason: 'invalid_external_id' };
  }
  if (typeof contentHash !== 'string' || !CONTENT_HASH_RE.test(contentHash)) {
    return { ok: false, reason: 'invalid_content_hash' };
  }
  if (typeof queuedAt !== 'string' || Number.isNaN(Date.parse(queuedAt))) {
    return { ok: false, reason: 'invalid_queued_at' };
  }

  const attempt =
    typeof o.attempt === 'number' && Number.isFinite(o.attempt) ? Math.max(0, Math.floor(o.attempt)) : 0;
  const correlationId =
    typeof o.correlationId === 'string' && o.correlationId.length <= 64 ? o.correlationId : undefined;

  return {
    ok: true,
    job: { externalId, contentHash, queuedAt, attempt, correlationId },
  };
}
