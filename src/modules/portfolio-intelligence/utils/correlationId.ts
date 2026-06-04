import { randomUUID } from 'crypto';

/** Propagate through webhook → job → publish → WS. */
export function createCorrelationId(prefix = 'pi'): string {
  return `${prefix}-${randomUUID()}`;
}

export function correlationIdFromDedupeKey(dedupeKey: string): string {
  return `wh-${dedupeKey.slice(0, 32)}`;
}
