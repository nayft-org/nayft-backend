import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const featureConfig: FeatureConfig = {
  key: 'risk_ranking',
  name: 'Risk Ranking System',
  module: 'risk',
  description: 'Coin-level CRS risk snapshots and alerts',
  category: 'premium',
  controllable: true,
};
