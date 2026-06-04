import {
  GOLDEN_FIXTURE_IDS,
  certifyFixture,
  runGoldenFixture,
} from '../__fixtures__/goldenHarness';

describe('piAnalyticsPipeline golden certification', () => {
  it.each(GOLDEN_FIXTURE_IDS)('%s matches pinned expected output', (id) => {
    const result = certifyFixture(id);
    expect(result.missingExpected).toBe(false);
    expect(result.equal).toBe(true);
  });

  it('canonical_btc_maxi has dominant Bitcoin bucket', () => {
    const out = runGoldenFixture('canonical_btc_maxi');
    expect(out.allocation.topCategory.id).toBe('Bitcoin');
    expect(out.allocation.byCategory.Bitcoin).toBeGreaterThanOrEqual(55);
    expect(out.schemaVersion).toBe(2);
  });

  it('canonical_meme_heavy has >=25% Memes allocation', () => {
    const out = runGoldenFixture('canonical_meme_heavy');
    expect(out.allocation.byCategory.Memes ?? 0).toBeGreaterThanOrEqual(25);
  });

  it('canonical_stable_heavy has >=20% Stablecoins', () => {
    const out = runGoldenFixture('canonical_stable_heavy');
    expect(out.allocation.byCategory.Stablecoins ?? 0).toBeGreaterThanOrEqual(20);
  });
});
