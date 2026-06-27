import type { FeatureConfig } from '../../core/feature-system/featureRegistry';

export const feedRankingFeatureConfig: FeatureConfig = {
  key: 'feed_ranking_server',
  name: 'Server Feed Ranking',
  module: 'feed-ranking',
  description: 'Pre-computed feed ranking via Redis sorted sets',
  category: 'premium',
  controllable: true,
};

export const feedRankingFacadeFeatureConfig: FeatureConfig = {
  key: 'feed_ranking_uses_pi_facade',
  name: 'Feed Ranking PI Facade',
  module: 'feed-ranking',
  description: 'Feed ranking consumes FeedIntelligenceContract via PI facade',
  category: 'premium',
  controllable: true,
};
