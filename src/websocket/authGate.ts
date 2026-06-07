import type WebSocket from 'ws';
import type { RuntimeKillSwitches } from '../core/runtime-config/runtimeConfig.types';
import { getRuntimeSwitches } from '../core/runtime-config/runtimeConfig.service';
import { incrementComplianceMetric } from '../observability/complianceMetrics';

let cachedSwitches: RuntimeKillSwitches | null = null;
let cachedAt = 0;
const SWITCH_TTL_MS = 10_000;

export async function getWsRuntimeSwitches(): Promise<RuntimeKillSwitches> {
  const now = Date.now();
  if (cachedSwitches && now - cachedAt < SWITCH_TTL_MS) {
    return cachedSwitches;
  }
  cachedSwitches = await getRuntimeSwitches();
  cachedAt = now;
  return cachedSwitches;
}

export function invalidateWsRuntimeSwitchCache(): void {
  cachedSwitches = null;
  cachedAt = 0;
}

/** Whether query-string JWT may bind user on connect (WS v1). */
export async function allowWsV1QueryToken(): Promise<boolean> {
  const switches = await getWsRuntimeSwitches();
  return switches.ws_protocol_v1_enabled;
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
