import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const featureConfig: FeatureConfig = {
  key: 'metrics',
  name: 'Metrics',
  module: 'metrics',
  description: 'Performance monitoring and cache stats',
  category: 'free',
  controllable: true,
};
