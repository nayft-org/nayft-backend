import { registerFeature } from '../../core/feature-system/featureRegistry';
import { feedRankingFeatureConfig, feedRankingFacadeFeatureConfig } from './featureConfig';

export async function bootstrapFeedRankingFeatures(): Promise<void> {
  await registerFeature(feedRankingFeatureConfig);
  await registerFeature(feedRankingFacadeFeatureConfig);
}
