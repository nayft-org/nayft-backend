import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const interestProfileFeatureConfig: FeatureConfig = {
  key: 'interest_profile_engine',
  name: 'Interest Profile Engine',
  module: 'interest-profile',
  description: 'Aggregated user interest signals for feed personalization',
  category: 'premium',
  controllable: true,
};
