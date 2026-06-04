import { normalizeBpsHamilton, BPS_TOTAL, riskScoreTenthsFromBps } from '../math/piMath';

describe('piMath', () => {
  it('normalizes bps to exactly 10000', () => {
    const out = normalizeBpsHamilton({ Bitcoin: 3333, Layer1: 3333, DeFi: 3334 });
    const sum = Object.values(out).reduce((s, v) => s + v, 0);
    expect(sum).toBe(BPS_TOTAL);
  });

  it('computes risk score deterministically', () => {
    const bps = { Bitcoin: 6000, Memes: 4000 };
    const weights = { Bitcoin: 3, Memes: 9.5, Other: 6 };
    const a = riskScoreTenthsFromBps(bps, weights);
    const b = riskScoreTenthsFromBps(bps, weights);
    expect(a).toBe(b);
  });
});
