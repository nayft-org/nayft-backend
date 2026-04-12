/**
 * In-process translation observability (mirrors httpPerformanceStats pattern).
 */

export type TranslationMetricCounter =
  | 'requests'
  | 'cache_hits'
  | 'cache_misses'
  | 'provider_errors'
  | 'chars_sent'
  | 'fallback_english'
  | 'truncated';

const counters: Record<TranslationMetricCounter, number> = {
  requests: 0,
  cache_hits: 0,
  cache_misses: 0,
  provider_errors: 0,
  chars_sent: 0,
  fallback_english: 0,
  truncated: 0,
};

let providerLatencyMsTotal = 0;
let providerCalls = 0;

export function recordTranslationEvent(
  kind: TranslationMetricCounter,
  amount: number = 1
): void {
  counters[kind] = (counters[kind] || 0) + amount;
}

export function recordProviderLatency(ms: number): void {
  providerLatencyMsTotal += ms;
  providerCalls += 1;
}

export function getTranslationMetricsSnapshot(): {
  counters: Record<TranslationMetricCounter, number>;
  providerAvgLatencyMs: number;
} {
  return {
    counters: { ...counters },
    providerAvgLatencyMs: providerCalls > 0 ? providerLatencyMsTotal / providerCalls : 0,
  };
}
