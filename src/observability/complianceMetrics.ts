/** Compliance / schema enforcement counters for logs, metrics endpoint, and future Prometheus wiring. */

export const complianceMetrics = {
  rejectedEventsTotal: 0,
  schemaViolationTotal: 0,
  wsAuthFailuresTotal: 0,
  consentBlockedTotal: 0,
  eventsIngestDisabledTotal: 0,
  eventsIngestAcceptedTotal: 0,
  eventsIngestQueuedTotal: 0,
  portfolioSubscribeAuthzDeniedTotal: 0,
  wsV1ConnectionsTotal: 0,
  wsV2ConnectionsTotal: 0,
  personalizationDisabledTotal: 0,
  dlqPushedTotal: 0,
  invalidJsonQueueTotal: 0,
  providerCallErrorsTotal: 0,
  migrationQuarantineTotal: 0,
  migrationSanitizeTotal: 0,
  rolloutHealthScore: 100,
};

export function incrementComplianceMetric(
  key: keyof typeof complianceMetrics,
  delta = 1
): void {
  if (key === 'rolloutHealthScore') return;
  complianceMetrics[key] += delta;
}

export function setRolloutHealthScore(score: number): void {
  complianceMetrics.rolloutHealthScore = Math.max(0, Math.min(100, Math.round(score)));
}

export function getComplianceMetricsSnapshot(): Record<string, number> {
  return { ...complianceMetrics };
}
