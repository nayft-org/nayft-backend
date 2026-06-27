import { mergeZerionAndExchangeHoldings } from './holdingsMerge';

describe('mergeZerionAndExchangeHoldings', () => {
  it('adds exchange value to totals and tags wallet sources', () => {
    const merged = mergeZerionAndExchangeHoldings(
      {
        totalValue: 1000,
        absoluteChange24h: 50,
        relativeChange24h: 0.05,
        positions: [
          { name: 'ETH', symbol: 'ETH', quantity: 1, value: 1000, chain: 'eth', source: 'wallet' },
        ],
      },
      [
        {
          name: 'BTC',
          symbol: 'BTC',
          quantity: 0.1,
          value: 5000,
          chain: 'coindcx',
          source: 'exchange',
          venue: 'coindcx',
          sourceConnectionId: 'abc',
        },
      ]
    );
    expect(merged.totalValue).toBe(6000);
    expect(merged.absoluteChange24h).toBe(50);
    expect(merged.positions[0].source).toBe('wallet');
    expect(merged.positions[1].source).toBe('exchange');
  });

  it('with wallet-only, relativeChange matches scaling when exchange is zero', () => {
    const merged = mergeZerionAndExchangeHoldings(
      { totalValue: 100, absoluteChange24h: 10, relativeChange24h: 0.1, positions: [] },
      []
    );
    expect(merged.totalValue).toBe(100);
    expect(merged.relativeChange24h).toBe(0.1);
  });
});
