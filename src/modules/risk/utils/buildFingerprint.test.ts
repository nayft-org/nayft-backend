import { computeUniverseHash, floorTo15MinUtc } from './buildFingerprint';

describe('buildFingerprint utils', () => {
  it('universe hash is stable regardless of input order', () => {
    const a = computeUniverseHash([
      { symbol: 'ETH' },
      { symbol: 'BTC' },
    ]);
    const b = computeUniverseHash([
      { symbol: 'BTC' },
      { symbol: 'ETH' },
    ]);
    expect(a).toBe(b);
  });

  it('floors to 15 minute UTC boundary', () => {
    const d = new Date('2026-06-02T15:07:30.000Z');
    const floored = floorTo15MinUtc(d);
    expect(floored.toISOString()).toBe('2026-06-02T15:00:00.000Z');
  });
});
