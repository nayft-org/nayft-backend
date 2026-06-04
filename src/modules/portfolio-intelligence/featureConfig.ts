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

export const piEnginesFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_engines',
  name: 'Portfolio Intelligence Engines',
  module: PI_MODULE,
  description: 'Deterministic portfolio analytics engines',
  category: 'premium',
  controllable: true,
};

export const piHealthFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_health_score',
  name: 'Portfolio Health Score',
  module: PI_MODULE,
  description: 'Composite portfolio health score',
  category: 'premium',
  controllable: true,
};

export const piInsightsFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_insights',
  name: 'Portfolio Intelligence Insights',
  module: PI_MODULE,
  description: 'Rule-based portfolio insights',
  category: 'premium',
  controllable: true,
};

export const piFeedIntelFeatureConfig: FeatureConfig = {
  key: 'portfolio_intelligence_feed_intel',
  name: 'Portfolio Feed Intelligence',
  module: PI_MODULE,
  description: 'Narrative and conviction vectors for feed ranking',
  category: 'premium',
  controllable: true,
};
