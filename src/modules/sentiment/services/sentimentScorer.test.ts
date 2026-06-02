import { scoreArticleText } from './sentimentScorer.service';

describe('sentimentScorer', () => {
  it('scores bullish ETF headline positively', () => {
    const r = scoreArticleText({
      title: 'Bitcoin ETF approval drives massive inflow',
      subtitle: 'Institutional adoption accelerates',
      sourceKey: 'coindesk',
    });
    expect(r.score).toBeGreaterThan(0);
    expect(['bullish', 'neutral']).toContain(r.label);
  });

  it('scores hack headline negatively or risk', () => {
    const r = scoreArticleText({
      title: 'Major exchange hack triggers liquidation cascade',
      subtitle: 'Exploit drains funds',
      sourceKey: 'coindesk',
    });
    expect(r.score).toBeLessThan(0);
    expect(['bearish', 'risk']).toContain(r.label);
  });
});
