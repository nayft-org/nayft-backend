import { createHash } from 'crypto';

function sortValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function etagFromCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 32);
}

export function validateReplay(
  stored: unknown,
  recomputed: unknown
): { equal: boolean; diffs: string[] } {
  const a = canonicalJson(stored);
  const b = canonicalJson(recomputed);
  if (a === b) return { equal: true, diffs: [] };
  return { equal: false, diffs: ['canonicalJson mismatch'] };
}
