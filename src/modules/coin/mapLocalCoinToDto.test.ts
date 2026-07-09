/**
 * Regression: Explore lists coins from LabeledActiveCoin; /coins/:id must serve
 * snapshot-only rows (no Coin collection document) instead of "Coin not found".
 */
import { mapLocalCoinToDto } from './mapLocalCoinToDto';

describe('mapLocalCoinToDto', () => {
  it('maps snapshot-only labeled active coin (e.g. palm-usd)', () => {
    const dto = mapLocalCoinToDto({
      dbCoin: null,
      snapshot: {
        id: 'palm-usd',
        symbol: 'pusd',
        name: 'Palm USD',
        image: 'https://example.com/pusd.png',
        current_price: 1.0,
        market_cap: 1_000_000,
        market_cap_rank: 420,
        total_volume: 50_000,
        price_change_percentage_24h: 0.12,
      },
      internalCoinId: null,
    });

    expect(dto).toEqual({
      internalCoinId: null,
      coinId: 'palm-usd',
      symbol: 'PUSD',
      name: 'Palm USD',
      rank: 420,
      price: 1.0,
      percentChange24h: 0.12,
      marketCap: 1_000_000,
      volume24h: 50_000,
      image: 'https://example.com/pusd.png',
    });
  });

  it('returns null when snapshot lacks identity fields', () => {
    expect(
      mapLocalCoinToDto({
        dbCoin: null,
        snapshot: { id: 'x' },
        internalCoinId: null,
      })
    ).toBeNull();
  });
});
