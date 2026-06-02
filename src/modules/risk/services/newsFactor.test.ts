import { applyNewsFactorGating } from './newsFactorLogic';
import { riskConfig } from '../config/riskConfig';

describe('applyNewsFactorGating', () => {
  const now = Date.now();

  it('returns neutral when RRS disabled', () => {
    const result = applyNewsFactorGating('BTC', null, { rrsEnabled: false });
    expect(result.newsNormalized).toBe(0.5);
    expect(result.flags).toContain('disabled');
  });

  it('returns no_news when snapshot missing', () => {
    const result = applyNewsFactorGating('BTC', null, { rrsEnabled: true });
    expect(result.flags).toContain('no_news');
  });

  it('returns ready when confidence and article count pass', () => {
    const result = applyNewsFactorGating(
      'BTC',
      {
        weightedScore: 0.4,
        normalizedScore: 0.72,
        confidence: 0.8,
        articleCount: 5,
        revision: 3,
        computedAt: new Date(now),
      },
      { rrsEnabled: true, nowMs: now }
    );
    expect(result.flags).toContain('ready');
    expect(result.newsNormalized).toBe(0.72);
  });

  it('returns low_confidence when article count below threshold', () => {
    const result = applyNewsFactorGating(
      'BTC',
      {
        weightedScore: 0.9,
        normalizedScore: 0.9,
        confidence: 0.9,
        articleCount: 1,
        revision: 1,
        computedAt: new Date(now),
      },
      { rrsEnabled: true, nowMs: now }
    );
    expect(result.flags).toContain('low_confidence');
    expect(result.newsNormalized).toBe(0.5);
  });

  it('returns stale_sentiment when snapshot too old', () => {
    const staleAt = new Date(now - riskConfig.newsStaleMs - 1000);
    const result = applyNewsFactorGating(
      'BTC',
      {
        weightedScore: 0.5,
        normalizedScore: 0.6,
        confidence: 0.9,
        articleCount: 10,
        revision: 1,
        computedAt: staleAt,
      },
      { rrsEnabled: true, nowMs: now }
    );
    expect(result.flags).toContain('stale_sentiment');
    expect(result.newsNormalized).toBe(0.5);
  });
});
