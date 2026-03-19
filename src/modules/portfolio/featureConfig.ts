import type { FeatureConfig } from '../../core/feature-system';

export const featureConfig: FeatureConfig = {
  key: 'portfolio_tracking',
  name: 'Portfolio Tracking',
  module: 'portfolio',
  description: 'Tracks user wallets and holdings via Alchemy and Zerion',
};
