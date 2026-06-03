import { validateRiskBuild } from './riskBuildValidator';
import { normalizeCrossSection } from '../normalization/crossSectionalNormalizer';
import { composeCrs, assignCrsRanks } from '../crs/crsComposer';
import type { RiskFactorName } from '../types/factorTypes';

const FACTORS: RiskFactorName[] = [
  'volatility',
  'liquidity',
  'drawdown',
  'fundamentals',
  'news',
];

function buildCrsMap(symbols: string[]) {
  const normalizedByFactor = new Map<RiskFactorName, ReturnType<typeof normalizeCrossSection>>();
  const rawValues = new Map(symbols.map((s, i) => [s, 0.1 + i * 0.15]));
  for (const factor of FACTORS) {
    normalizedByFactor.set(factor, normalizeCrossSection(rawValues, factor));
  }
  const crsMap = new Map<string, ReturnType<typeof composeCrs>>();
  for (const sym of symbols) {
    const normalized = {} as Record<RiskFactorName, ReturnType<typeof normalizeCrossSection> extends Map<string, infer V> ? V : never>;
    const raw = {} as Record<RiskFactorName, { raw: number; confidence: number; flags: string[]; factorSnapshotTime: Date; buildCutoffTime: Date; stalenessMs: number; invalid: boolean }>;
    const now = new Date();
    for (const f of FACTORS) {
      normalized[f] = normalizedByFactor.get(f)!.get(sym)!;
      raw[f] = {
        raw: rawValues.get(sym)!,
        confidence: 0.8,
        flags: [],
        factorSnapshotTime: now,
        buildCutoffTime: now,
        stalenessMs: 0,
        invalid: false,
      };
    }
    crsMap.set(sym, composeCrs(sym, normalized, raw));
  }
  assignCrsRanks(crsMap);
  return { normalizedByFactor, crsMap };
}

describe('riskBuildValidator', () => {
  it('passes a healthy synthetic universe', () => {
    const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'LINK', 'UNI', 'AVAX', 'MATIC'];
    const { normalizedByFactor, crsMap } = buildCrsMap(symbols);
    const result = validateRiskBuild({
      universeSize: symbols.length,
      normalizedByFactor,
      crsMap,
      priorRevision: 1,
      nextRevision: 2,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when universe is too small', () => {
    const { normalizedByFactor, crsMap } = buildCrsMap(['BTC', 'ETH']);
    const result = validateRiskBuild({
      universeSize: 2,
      normalizedByFactor,
      crsMap,
      nextRevision: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('universe_too_small');
  });

  it('fails on revision gap', () => {
    const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'LINK', 'UNI', 'AVAX', 'MATIC'];
    const { normalizedByFactor, crsMap } = buildCrsMap(symbols);
    const result = validateRiskBuild({
      universeSize: symbols.length,
      normalizedByFactor,
      crsMap,
      priorRevision: 5,
      nextRevision: 7,
    });
    expect(result.errors).toContain('revision_gap');
  });
});
