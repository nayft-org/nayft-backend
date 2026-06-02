const SOURCE_TRUST: Record<string, number> = {
  coindesk: 1.0,
  'coin-desk': 1.0,
  reuters: 0.95,
  bloomberg: 0.95,
};

export function getSourceTrust(sourceKey?: string, sourceName?: string): number {
  const key = (sourceKey || sourceName || '').toLowerCase().trim();
  if (!key) return 0.5;
  if (SOURCE_TRUST[key] !== undefined) return SOURCE_TRUST[key];
  if (key.includes('coindesk')) return 1.0;
  return 0.6;
}
