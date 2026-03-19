import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const featureConfig: FeatureConfig = {
  key: 'comments',
  name: 'Comments',
  module: 'comment',
  description: 'Comments and replies on news',
  category: 'free',
  controllable: true,
};
