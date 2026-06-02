import { normalizeCrossSection, checkNormalizationHealth } from './crossSectionalNormalizer';

describe('crossSectionalNormalizer', () => {
  it('produces deterministic percentiles for same input', () => {
    const values = new Map([
      ['BTC', 0.1],
      ['ETH', 0.3],
      ['SOL', 0.5],
      ['XRP', 0.7],
      ['ADA', 0.9],
    ]);
    const a = normalizeCrossSection(values, 'volatility');
    const b = normalizeCrossSection(values, 'volatility');
    for (const sym of values.keys()) {
      expect(a.get(sym)?.normalized).toBe(b.get(sym)?.normalized);
    }
  });

  it('uses stable symbol tie-break for equal values', () => {
    const values = new Map([
      ['BTC', 0.5],
      ['ETH', 0.5],
      ['SOL', 0.5],
    ]);
    const result = normalizeCrossSection(values, 'liquidity');
    const norms = [...result.values()].map((r) => r.normalized);
    expect(norms[0]).toBe(norms[1]);
    expect(norms[1]).toBe(norms[2]);
  });

  it('passes health check for spread distribution', () => {
    const values = new Map([
      ['A', 0.1],
      ['B', 0.3],
      ['C', 0.5],
      ['D', 0.7],
      ['E', 0.9],
    ]);
    const norm = normalizeCrossSection(values, 'drawdown');
    expect(checkNormalizationHealth(norm).ok).toBe(true);
  });
});
