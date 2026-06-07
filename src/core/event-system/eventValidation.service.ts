import type { SchemaEnforcementMode } from '../runtime-config/runtimeConfig.types';
import {
  validateClientEventMetadata,
  validateServerEventMetadata,
} from './eventRegistry';
import { incrementComplianceMetric } from '../../observability/complianceMetrics';

export interface ValidatedEventPayload {
  featureKey: string;
  eventType: string;
  userId?: string;
  metadata: Record<string, unknown>;
}

export function validateIncomingClientEvent(
  payload: ValidatedEventPayload,
  mode: SchemaEnforcementMode
): { accept: boolean; payload: ValidatedEventPayload; reason?: string } {
  if (mode === 'off') return { accept: true, payload };

  const result = validateClientEventMetadata(
    payload.featureKey,
    payload.eventType,
    payload.metadata || {}
  );

  if (result.ok) {
    return { accept: true, payload: { ...payload, metadata: result.metadata } };
  }

  incrementComplianceMetric('schemaViolationTotal');
  if (mode === 'log') {
    return { accept: true, payload, reason: result.reason };
  }
  return { accept: false, payload, reason: result.reason };
}

export function validateServerEvent(
  payload: ValidatedEventPayload,
  mode: SchemaEnforcementMode = 'log'
): { accept: boolean; payload: ValidatedEventPayload; reason?: string } {
  if (mode === 'off') return { accept: true, payload };

  const rejectUnknown = mode === 'enforce';
  const result = validateServerEventMetadata(
    payload.featureKey,
    payload.eventType,
    payload.metadata || {},
    { rejectUnknown }
  );
  if (result.ok) {
    return { accept: true, payload: { ...payload, metadata: result.metadata } };
  }
  incrementComplianceMetric('schemaViolationTotal');
  if (mode === 'enforce') {
    return { accept: false, payload, reason: result.reason };
  }
  if (mode === 'log') {
    return { accept: true, payload, reason: result.reason };
  }
  return { accept: true, payload };
}

export { hashRoute } from './eventRegistry';
