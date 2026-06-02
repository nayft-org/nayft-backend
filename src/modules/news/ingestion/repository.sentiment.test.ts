import { assertNoWorkerFieldsInSet } from './repository';

describe('ingestionRepository sentiment guards', () => {
  it('throws when worker-owned fields appear in $set', () => {
    expect(() =>
      assertNoWorkerFieldsInSet({
        title: 'Hello',
        sentiment: 'bullish',
      })
    ).toThrow(/worker-owned field: sentiment/);

    expect(() =>
      assertNoWorkerFieldsInSet({
        sentimentStatus: 'pending',
      })
    ).toThrow(/sentimentStatus/);

    expect(() =>
      assertNoWorkerFieldsInSet({
        sentimentAnalysis: { score: 1 },
      })
    ).toThrow(/sentimentAnalysis/);
  });

  it('allows content-only fields', () => {
    expect(() =>
      assertNoWorkerFieldsInSet({
        title: 'BTC rises',
        subtitle: 'Markets up',
        coins: [{ symbol: 'BTC', name: 'Bitcoin' }],
      })
    ).not.toThrow();
  });
});
