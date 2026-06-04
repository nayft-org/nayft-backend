import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

const PI_MODULE = 'portfolio-intelligence';

export const featureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_foundation',
  name: 'Portfolio Intelligence Foundation',
  module: PI_MODULE,
  description: 'Async portfolio normalization, snapshots, and intelligence infrastructure',
  category: 'premium',
  controllable: true,
};

export const piShadowFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_shadow',
  name: 'Portfolio Intelligence Shadow Mode',
  module: PI_MODULE,
  description: 'Compute PI state to shadow prefix without serving',
  category: 'premium',
  controllable: true,
};

export const piContextFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_context_api',
  name: 'Portfolio Intelligence Context API',
  module: PI_MODULE,
  description: 'Expose held-symbol context for feed personalization',
  category: 'premium',
  controllable: true,
};

export const piRealtimeFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_realtime',
  name: 'Portfolio Intelligence Realtime Fanout',
  module: PI_MODULE,
  description: 'Redis-backed portfolio WS fanout across replicas',
  category: 'premium',
  controllable: true,
};

export const piNormalizedFeatureConfig: FeatureConfig = {
  key: 'portfolio_normalized_positions',
  name: 'Portfolio Normalized Positions Read',
  module: PI_MODULE,
  description: 'Serve holdings from normalized position store',
  category: 'premium',
  controllable: true,
};
