/** Lightweight counters for logs / future Prometheus wiring */

export const notifMetrics = {
  notificationsCreatedTotal: 0,
  invalidEventTotal: 0,
  skippedFeatureDisabledTotal: 0,
  skippedPreferenceTotal: 0,
  skippedThrottleTotal: 0,
  skippedDedupeTotal: 0,
  materializeErrorTotal: 0,
  streamProcessedTotal: 0,
  streamAckTotal: 0,
  pushAttemptedTotal: 0,
  pushSucceededTotal: 0,
  pushFailedTotal: 0,
};
