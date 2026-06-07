/** Computes rollout health score from compliance metrics (0-100). */
import { getComplianceMetricsSnapshot } from './complianceMetrics';

export function computeRolloutHealthScore(): number {
  const m = getComplianceMetricsSnapshot();
  let score = 100;

  if (m.schemaViolationTotal > 50) score -= 15;
  if (m.wsAuthFailuresTotal > 20) score -= 20;
  if (m.rejectedEventsTotal > 100) score -= 10;
  if (m.dlqPushedTotal > 50) score -= 15;

  return Math.max(0, Math.min(100, score));
}
