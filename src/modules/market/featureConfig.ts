import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const featureConfig: FeatureConfig = {
  key: 'market_data',
  name: 'Market Data',
  module: 'market',
  description: 'Trending coins, top gainers, market data',
  category: 'free',
  controllable: true,
};
