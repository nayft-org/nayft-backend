import { piMetrics } from '../../../observability/piMetrics';
import type { PortfolioAnalyticsPayloadV2 } from '../contracts/piEngineContracts';

export type QualitySnapshot = {
  mappingCoveragePct: number;
  partialRate: number;
  engineErrorCount: number;
  insightCount: number;
  confidencePortfolio: number;
  recordedAt: string;
};

const recentSamples: QualitySnapshot[] = [];
const MAX_SAMPLES = 500;

export const intelligenceQualityMonitor = {
  record(payload: PortfolioAnalyticsPayloadV2): void {
    const sample: QualitySnapshot = {
      mappingCoveragePct: payload.telemetry?.mappingCoveragePct ?? 0,
      partialRate: payload.partial ? 1 : 0,
      engineErrorCount: payload.engineErrors?.length ?? 0,
      insightCount: payload.insights?.length ?? 0,
      confidencePortfolio: payload.confidence?.portfolio ?? 0,
      recordedAt: new Date().toISOString(),
    };
    recentSamples.push(sample);
    if (recentSamples.length > MAX_SAMPLES) recentSamples.shift();

    if (sample.mappingCoveragePct < 0.7) {
      piMetrics.recomputeFailed('quality_low_mapping');
    }
  },

  getSnapshot(): {
    sampleSize: number;
    avgMappingCoverage: number;
    partialRate: number;
    avgConfidence: number;
  } {
    if (recentSamples.length === 0) {
      return { sampleSize: 0, avgMappingCoverage: 0, partialRate: 0, avgConfidence: 0 };
    }
    const n = recentSamples.length;
    const avgMappingCoverage =
      recentSamples.reduce((s, x) => s + x.mappingCoveragePct, 0) / n;
    const partialRate = recentSamples.reduce((s, x) => s + x.partialRate, 0) / n;
    const avgConfidence =
      recentSamples.reduce((s, x) => s + x.confidencePortfolio, 0) / n;
    return { sampleSize: n, avgMappingCoverage, partialRate, avgConfidence };
  },
};
