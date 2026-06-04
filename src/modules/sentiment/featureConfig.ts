import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const featureConfig: FeatureConfig = {
  key: 'coin_sentiment',
  name: 'Coin Sentiment',
  module: 'sentiment',
  description: 'Per-coin news sentiment aggregation',
  category: 'premium',
  controllable: true,
};
