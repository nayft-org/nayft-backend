import { createHash } from 'crypto';
import { riskConfig } from '../config/riskConfig';

export function computeUniverseHash(
  members: Array<{ symbol: string; internalCoinId?: string }>
): string {
  const sorted = [...members].sort((a, b) => {
    const sym = a.symbol.localeCompare(b.symbol, 'en', { sensitivity: 'base' });
    if (sym !== 0) return sym;
    return (a.internalCoinId || '').localeCompare(b.internalCoinId || '', 'en', { sensitivity: 'base' });
  });
  const payload = JSON.stringify(sorted);
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function computeBuildFingerprint(params: {
  buildId: string;
  buildCutoffTime: Date;
  universeHash: string;
  sentimentRevision: number | null;
}): string {
  const parts = [
    params.buildId,
    params.buildCutoffTime.toISOString(),
    params.universeHash,
    riskConfig.factorSchemaVersion,
    riskConfig.normalizationVersion,
    riskConfig.crsFormulaVersion,
    riskConfig.regimeLogicVersion,
    String(params.sentimentRevision ?? ''),
    JSON.stringify(riskConfig.providerVersions),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

export function floorTo15MinUtc(date: Date): Date {
  const ms = date.getTime();
  const interval = 15 * 60 * 1000;
  return new Date(Math.floor(ms / interval) * interval);
}
