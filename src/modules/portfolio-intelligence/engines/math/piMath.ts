/** Deterministic integer math for PI engines (bps = basis points, 10000 = 100%). */

export const BPS_TOTAL = 10_000;

export function valueToBps(valueUsd: number, totalUsd: number): number {
  if (totalUsd <= 0 || valueUsd <= 0) return 0;
  return Math.floor((valueUsd / totalUsd) * BPS_TOTAL);
}

export function bpsToPct1(bps: number): number {
  return Math.round(bps / 10) / 10;
}

export function normalizeBpsHamilton(bucketBps: Record<string, number>): Record<string, number> {
  const entries = Object.entries(bucketBps).sort(([a], [b]) => a.localeCompare(b));
  let sum = entries.reduce((s, [, v]) => s + v, 0);
  if (sum === 0) return {};
  if (sum === BPS_TOTAL) {
    return Object.fromEntries(entries.map(([k, v]) => [k, v]));
  }

  const scaled = entries.map(([k, v]) => {
    const raw = (v / sum) * BPS_TOTAL;
    const floored = Math.floor(raw);
    return { k, floored, remainder: raw - floored };
  });

  let allocated = scaled.reduce((s, x) => s + x.floored, 0);
  const byRemainder = [...scaled].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return b.k.localeCompare(a.k);
  });

  const result: Record<string, number> = {};
  for (const x of scaled) {
    result[x.k] = x.floored;
  }
  let i = 0;
  while (allocated < BPS_TOTAL && i < byRemainder.length) {
    result[byRemainder[i].k] += 1;
    allocated += 1;
    i += 1;
  }
  return result;
}

export function bpsRecordToPct(byBps: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(byBps)) {
    out[k] = bpsToPct1(v);
  }
  return out;
}

export function roundHalfUp(n: number): number {
  return Math.round(n);
}

export function riskScoreTenthsFromBps(
  byBps: Record<string, number>,
  riskWeights: Record<string, number>
): number {
  let sum = 0;
  for (const [bucket, bps] of Object.entries(byBps)) {
    const w = riskWeights[bucket] ?? riskWeights.Other ?? 6;
    sum += (bps / BPS_TOTAL) * w;
  }
  return Math.round(sum * 10);
}

export function tenthsToScore(tenths: number): number {
  return Math.round(tenths) / 10;
}

export function compareReplayExact(a: number, b: number): boolean {
  return a === b;
}
