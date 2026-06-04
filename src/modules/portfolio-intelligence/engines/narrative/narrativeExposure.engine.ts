import { loadNarrativeMapV1 } from '../../config/piFormulaRegistry';
import { bpsToPct1 } from '../math/piMath';
import type { PipelineState } from '../../contracts/piEngineContracts';

export function runNarrativeExposure(state: PipelineState) {
  const map = loadNarrativeMapV1();
  const narrativeBps: Record<string, number> = {};

  for (const [bucket, bps] of Object.entries(state.allocationBps)) {
    const narrativeId = map.bucketToNarrative[bucket] ?? 'Infrastructure';
    narrativeBps[narrativeId] = (narrativeBps[narrativeId] ?? 0) + bps;
  }

  const vector: Record<string, number> = {};
  for (const [id, bps] of Object.entries(narrativeBps)) {
    vector[id] = bpsToPct1(bps);
  }

  const ranked = Object.entries(vector)
    .sort(([, a], [, b]) => b - a || 0)
    .map(([id, pct]) => ({ id, name: id, pct }))
    .slice(0, 5);

  const dominant = ranked[0] ?? { id: 'Infrastructure', name: 'Infrastructure', pct: 0 };

  return { vector, dominant, ranked };
}

export const NEUTRAL_NARRATIVE = {
  vector: {} as Record<string, number>,
  dominant: { id: 'Unknown', name: 'Unknown', pct: 0 },
  ranked: [] as Array<{ id: string; name: string; pct: number }>,
};
