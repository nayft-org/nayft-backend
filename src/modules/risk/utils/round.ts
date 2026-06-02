/** Deterministic rounding per RRS quant hardening spec. */
export function roundRaw(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1e8) / 1e8;
}

export function roundPercentile(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 1e6) / 1e6;
}

export function roundCrs(value: number): number {
  return roundPercentile(value);
}

export function roundConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 1e4) / 1e4;
}
