import type { RiskFactorName, NormalizedFactorResult } from '../types/factorTypes';
import { roundPercentile, roundRaw } from '../utils/round';

function winsorizeIndex(n: number, p: number): number {
  if (n <= 1) return 0;
  return Math.floor(p * (n - 1));
}

export function normalizeCrossSection(
  values: Map<string, number>,
  factor: RiskFactorName
): Map<string, NormalizedFactorResult> {
  const out = new Map<string, NormalizedFactorResult>();
  const entries: Array<{ symbol: string; value: number }> = [];

  for (const [symbol, value] of values) {
    if (!Number.isFinite(value)) {
      out.set(symbol, {
        normalized: 0.5,
        rank: 0,
        percentile: 0.5,
        excluded: true,
        flags: ['invalid_raw'],
      });
      continue;
    }
    entries.push({ symbol, value: roundRaw(value) });
  }

  if (entries.length === 0) return out;

  const sorted = [...entries].sort((a, b) => {
    const v = a.value - b.value;
    if (v !== 0) return v;
    return a.symbol.localeCompare(b.symbol, 'en', { sensitivity: 'base' });
  });

  const n = sorted.length;
  const p1 = sorted[winsorizeIndex(n, 0.01)].value;
  const p99 = sorted[winsorizeIndex(n, 0.99)].value;

  const winsorized = sorted.map((e) => ({
    symbol: e.symbol,
    value: roundRaw(Math.max(p1, Math.min(p99, e.value))),
  }));

  const uniqueValues = new Set(winsorized.map((w) => w.value));
  if (uniqueValues.size <= 1) {
    for (const w of winsorized) {
      out.set(w.symbol, {
        normalized: 0.5,
        rank: 1,
        percentile: 0.5,
        excluded: false,
        flags: ['degenerate_distribution', factor],
      });
    }
    return out;
  }

  let i = 0;
  while (i < winsorized.length) {
    let j = i;
    while (j + 1 < winsorized.length && winsorized[j + 1].value === winsorized[i].value) {
      j += 1;
    }
    const avgRank = (i + 1 + j + 1) / 2;
    const percentile = n === 1 ? 0.5 : roundPercentile((avgRank - 1) / (n - 1));
    for (let k = i; k <= j; k++) {
      out.set(winsorized[k].symbol, {
        normalized: percentile,
        rank: Math.round(avgRank),
        percentile,
        excluded: false,
        flags: [],
      });
    }
    i = j + 1;
  }

  return out;
}

export function checkNormalizationHealth(
  normalized: Map<string, NormalizedFactorResult>
): { ok: boolean; reason?: string } {
  const values = [...normalized.values()].filter((v) => !v.excluded).map((v) => v.normalized);
  if (values.length < 4) return { ok: false, reason: 'too_few_values' };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std < 0.02) return { ok: false, reason: 'low_stddev' };
  const unique = new Set(values.map((v) => v.toFixed(4))).size;
  if (unique < 3) return { ok: false, reason: 'low_unique' };
  return { ok: true };
}
