import type { PiEngineContext, PipelineState } from '../../contracts/piEngineContracts';
import { valueToBps, normalizeBpsHamilton, bpsRecordToPct } from '../math/piMath';

export type AllocationResult = {
  byCategory: Record<string, number>;
  byCategoryBps: Record<string, number>;
  topCategory: { id: string; name: string; pct: number };
  categoryCount: number;
  unmappedCount: number;
  explain: PiEngineContext['positions'] extends never ? never : {
    eligibleCount: number;
    excludedCount: number;
    unmappedCount: number;
    normalizationMethod: string;
  };
};

export function runCategoryAllocation(ctx: PiEngineContext): AllocationResult {
  const bucketBps: Record<string, number> = {};
  let unmapped = 0;

  for (const pos of ctx.positions) {
    const mapping = ctx.positionMappings.find((m) => m.internalCoinId === pos.internalCoinId);
    const bucket = mapping?.nayftBucket ?? 'Other';
    if (bucket === 'Other' && !mapping?.primaryCategoryId) unmapped += 1;
    bucketBps[bucket] = (bucketBps[bucket] ?? 0) + valueToBps(pos.valueUsd, ctx.totalValueUsd);
  }

  const normalized = normalizeBpsHamilton(bucketBps);
  const byCategory = bpsRecordToPct(normalized);
  const entries = Object.entries(normalized).sort(([, a], [, b]) => b - a);
  const top = entries[0] ?? ['Other', 0];

  return {
    byCategory,
    byCategoryBps: normalized,
    topCategory: { id: top[0], name: top[0], pct: byCategory[top[0]] ?? 0 },
    categoryCount: Object.keys(normalized).filter((k) => (normalized[k] ?? 0) > 0).length,
    unmappedCount: unmapped,
    explain: {
      eligibleCount: ctx.positions.length,
      excludedCount: ctx.excludedPositions.length,
      unmappedCount: unmapped,
      normalizationMethod: 'hamilton_largest_remainder',
    },
  };
}

export function initPipelineState(alloc: AllocationResult): PipelineState {
  return { allocationBps: alloc.byCategoryBps, allocationOk: Object.keys(alloc.byCategoryBps).length > 0 || alloc.explain.eligibleCount === 0 };
}
