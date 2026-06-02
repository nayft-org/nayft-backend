export const sentimentMetrics = {
  jobsEnqueuedTotal: 0,
  jobsProcessedTotal: 0,
  jobsFailedTotal: 0,
  jobsSkippedTotal: 0,
  backpressureSkipsTotal: 0,
  scoringDurationMsTotal: 0,
  scoringDurationMsCount: 0,
  queueLagMs: 0,
  queueDepth: 0,
  dlqDepth: 0,
  processingStaleCount: 0,
  aggregationDurationMs: 0,
  lastAggregationAt: null as string | null,
};

export function recordScoringDuration(ms: number): void {
  sentimentMetrics.scoringDurationMsTotal += ms;
  sentimentMetrics.scoringDurationMsCount += 1;
}

export function getWorkerFailureRate(): number {
  const total =
    sentimentMetrics.jobsProcessedTotal +
    sentimentMetrics.jobsFailedTotal +
    sentimentMetrics.jobsSkippedTotal;
  if (total === 0) return 0;
  return sentimentMetrics.jobsFailedTotal / total;
}

export function getAverageScoringMs(): number {
  if (sentimentMetrics.scoringDurationMsCount === 0) return 0;
  return sentimentMetrics.scoringDurationMsTotal / sentimentMetrics.scoringDurationMsCount;
}

export type SentimentHealthAlerts = {
  queueLagWarning: boolean;
  queueLagCritical: boolean;
  failureRateWarning: boolean;
  aggregationSlow: boolean;
  staleAggregation: boolean;
  dlqDepthWarning: boolean;
};

export function evaluateSentimentHealthAlerts(): SentimentHealthAlerts {
  const lastAggMs = sentimentMetrics.lastAggregationAt
    ? Date.now() - Date.parse(sentimentMetrics.lastAggregationAt)
    : Infinity;

  return {
    queueLagWarning: sentimentMetrics.queueLagMs > 300_000,
    queueLagCritical: sentimentMetrics.queueLagMs > 900_000,
    failureRateWarning: getWorkerFailureRate() > 0.03,
    aggregationSlow: sentimentMetrics.aggregationDurationMs > 60_000,
    staleAggregation: lastAggMs > 1_200_000,
    dlqDepthWarning: sentimentMetrics.dlqDepth > 100,
  };
}
