import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const featureConfig: FeatureConfig = {
  key: 'auth',
  name: 'Authentication',
  module: 'auth',
  description: 'Login, signup, and user authentication',
  category: 'free',
  controllable: true,
};
