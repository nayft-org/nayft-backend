type CounterMap = Map<string, number>;
type HistogramBucket = { count: number; sum: number; max: number };

const counters: CounterMap = new Map();
const histograms: Map<string, HistogramBucket> = new Map();

function inc(name: string, labels = '', delta = 1): void {
  const key = labels ? `${name}{${labels}}` : name;
  counters.set(key, (counters.get(key) ?? 0) + delta);
}

function observe(name: string, ms: number, labels = ''): void {
  const key = labels ? `${name}{${labels}}` : name;
  const b = histograms.get(key) ?? { count: 0, sum: 0, max: 0 };
  b.count += 1;
  b.sum += ms;
  b.max = Math.max(b.max, ms);
  histograms.set(key, b);
}

export const piMetrics = {
  recomputeEnqueued(trigger: string): void {
    inc('pi_recompute_enqueued_total', `trigger=${trigger}`);
  },
  recomputeCompleted(trigger: string, ms: number): void {
    inc('pi_recompute_completed_total', `trigger=${trigger}`);
    observe('pi_recompute_latency_ms', ms, `trigger=${trigger}`);
  },
  recomputeFailed(trigger: string): void {
    inc('pi_recompute_failures_total', `trigger=${trigger}`);
  },
  queueDepth(depth: number): void {
    inc('pi_recompute_queue_depth', '', 0);
    counters.set('pi_recompute_queue_depth', depth);
  },
  shadowDriftPct(pct: number): void {
    counters.set('pi_shadow_drift_pct', pct);
  },
  mappingLowConfidence(ratio: number): void {
    counters.set('pi_mapping_low_confidence_ratio', ratio);
  },
  publishDurationMs(ms: number): void {
    observe('pi_redis_publish_duration_ms', ms);
  },
  fanoutMessage(): void {
    inc('pi_ws_fanout_messages_total');
  },
  zerionCircuitOpen(): void {
    inc('pi_zerion_circuit_open_total');
  },
  engineLatencyMs(engine: string, ms: number): void {
    observe('pi_engine_latency_ms', ms, `engine=${engine}`);
  },
  engineFailed(engine: string): void {
    inc('pi_engine_failures_total', `engine=${engine}`);
  },
  insightsGenerated(count: number): void {
    inc('pi_insights_generated_total', '', count);
  },
  replayDriftPct(pct: number): void {
    counters.set('pi_replay_drift_pct', pct);
  },
  getSnapshot(): { counters: Record<string, number>; histograms: Record<string, HistogramBucket> } {
    return {
      counters: Object.fromEntries(counters),
      histograms: Object.fromEntries(histograms),
    };
  },
  resetForTests(): void {
    counters.clear();
    histograms.clear();
  },
};
