import type { NormalizedPosition } from '../contracts/piContracts';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'DOGE', 'LINK', 'AVAX', 'ARB', 'PEPE'];

export type SyntheticPortfolioSpec = {
  id: string;
  label: string;
  positions: NormalizedPosition[];
  totalValueUsd: number;
};

export const syntheticPortfolioGenerator = {
  generateBalanced(id = 'synthetic_balanced'): SyntheticPortfolioSpec {
    const weights = [0.35, 0.25, 0.15, 0.1, 0.05, 0.04, 0.03, 0.02, 0.01, 0];
    const total = 10_000;
    const positions: NormalizedPosition[] = SYMBOLS.map((symbol, i) => ({
      positionKey: `syn:${symbol}`,
      internalCoinId: `syn-${symbol.toLowerCase()}`,
      coingeckoId: symbol.toLowerCase(),
      symbol,
      name: symbol,
      chain: 'ethereum',
      quantity: 1,
      valueUsd: total * weights[i],
      weightPct: weights[i] * 100,
      source: 'wallet' as const,
      mappingConfidence: 1,
    })).filter((p) => p.valueUsd > 0);

    return { id, label: 'Synthetic Balanced', positions, totalValueUsd: total };
  },

  generateBtcMaxi(id = 'synthetic_btc_maxi'): SyntheticPortfolioSpec {
    const total = 15_000;
    const positions: NormalizedPosition[] = [
      {
        positionKey: 'syn:BTC',
        internalCoinId: 'syn-btc',
        coingeckoId: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        chain: 'bitcoin',
        quantity: 0.2,
        valueUsd: total * 0.75,
        weightPct: 75,
        source: 'wallet',
        mappingConfidence: 1,
      },
      {
        positionKey: 'syn:ETH',
        internalCoinId: 'syn-eth',
        coingeckoId: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        chain: 'ethereum',
        quantity: 1,
        valueUsd: total * 0.25,
        weightPct: 25,
        source: 'wallet',
        mappingConfidence: 1,
      },
    ];
    return { id, label: 'Synthetic BTC Maxi', positions, totalValueUsd: total };
  },

  listPresets(): SyntheticPortfolioSpec[] {
    return [this.generateBalanced(), this.generateBtcMaxi()];
  },
};
