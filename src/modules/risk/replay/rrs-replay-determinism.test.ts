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

/**
 * GATE: same raw vectors → identical CRS at 6 dp (replay determinism contract).
 */
describe('rrs replay determinism', () => {
  const symbols = ['ADA', 'BTC', 'ETH', 'SOL', 'XRP'];
  const rawBySymbol = new Map([
    ['BTC', { vol: 0.42, liq: 0.11, dd: 0.33, fund: 0.9, news: 0.55 }],
    ['ETH', { vol: 0.38, liq: 0.15, dd: 0.28, fund: 0.85, news: 0.5 }],
    ['SOL', { vol: 0.55, liq: 0.22, dd: 0.41, fund: 0.4, news: 0.6 }],
    ['XRP', { vol: 0.31, liq: 0.18, dd: 0.25, fund: 0.35, news: 0.45 }],
    ['ADA', { vol: 0.29, liq: 0.2, dd: 0.22, fund: 0.3, news: 0.4 }],
  ]);

  function runPipeline() {
    const factorMaps = {
      volatility: new Map(symbols.map((s) => [s, rawBySymbol.get(s)!.vol])),
      liquidity: new Map(symbols.map((s) => [s, rawBySymbol.get(s)!.liq])),
      drawdown: new Map(symbols.map((s) => [s, rawBySymbol.get(s)!.dd])),
      fundamentals: new Map(symbols.map((s) => [s, rawBySymbol.get(s)!.fund])),
      news: new Map(symbols.map((s) => [s, rawBySymbol.get(s)!.news])),
    };

    const normalizedByFactor = new Map<RiskFactorName, ReturnType<typeof normalizeCrossSection>>();
    for (const f of FACTORS) {
      normalizedByFactor.set(f, normalizeCrossSection(factorMaps[f], f));
    }

    const crsMap = new Map<string, ReturnType<typeof composeCrs>>();
    const now = new Date();
    for (const sym of symbols) {
      const normalized = {} as Record<RiskFactorName, ReturnType<typeof normalizeCrossSection> extends Map<string, infer V> ? V : never>;
      const raw = {} as Record<RiskFactorName, { raw: number; confidence: number; flags: string[]; factorSnapshotTime: Date; buildCutoffTime: Date; stalenessMs: number; invalid: boolean }>;
      for (const f of FACTORS) {
        normalized[f] = normalizedByFactor.get(f)!.get(sym)!;
        raw[f] = {
          raw: factorMaps[f].get(sym)!,
          confidence: 0.9,
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
    return crsMap;
  }

  it('produces identical CRS strings on double replay', () => {
    const a = runPipeline();
    const b = runPipeline();
    for (const sym of symbols) {
      expect(a.get(sym)!.crs.toFixed(6)).toBe(b.get(sym)!.crs.toFixed(6));
      expect(a.get(sym)!.rank).toBe(b.get(sym)!.rank);
      expect(a.get(sym)!.percentile.toFixed(6)).toBe(b.get(sym)!.percentile.toFixed(6));
    }
  });
});
