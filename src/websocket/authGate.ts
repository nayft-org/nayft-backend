import type WebSocket from 'ws';
import type { RuntimeKillSwitches } from '../core/runtime-config/runtimeConfig.types';
import { getRuntimeSwitchesSync } from '../core/runtime-config/runtimeConfig.service';
import { incrementComplianceMetric } from '../observability/complianceMetrics';

export async function getWsRuntimeSwitches(): Promise<RuntimeKillSwitches> {
  return getRuntimeSwitchesSync();
}

export function invalidateWsRuntimeSwitchCache(): void {
  /* snapshot managed by runtimeConfig.service refresh loop */
}

/** Sync read for WS upgrade hot path. */
export function allowWsV1QueryTokenSync(): boolean {
  return getRuntimeSwitchesSync().ws_protocol_v1_enabled;
}

/** Whether query-string JWT may bind user on connect (WS v1). */
export async function allowWsV1QueryToken(): Promise<boolean> {
  return allowWsV1QueryTokenSync();
}

/** Track v1 vs v2 auth path for metrics. */
export function recordWsProtocolVersion(version: 1 | 2): void {
  if (version === 1) {
    incrementComplianceMetric('wsV1ConnectionsTotal');
  } else {
    incrementComplianceMetric('wsV2ConnectionsTotal');
  }
}

export function isWsAuthenticated(ws: WebSocket, getUserId: (ws: WebSocket) => string | undefined): boolean {
  return Boolean(getUserId(ws));
}

/** Reject portfolio/notify subscription without authenticated user. */
export function rejectUnauthenticatedSubscription(
  ws: WebSocket,
  reason: string
): void {
  incrementComplianceMetric('wsAuthFailuresTotal');
  ws.close(4403, reason);
}
