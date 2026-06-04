import { registerFeature } from '../../core/feature-system/featureRegistry';
import {
  featureConfig,
  piShadowFeatureConfig,
  piContextFeatureConfig,
  piRealtimeFeatureConfig,
  piNormalizedFeatureConfig,
  piEnginesFeatureConfig,
  piHealthFeatureConfig,
  piInsightsFeatureConfig,
  piFeedIntelFeatureConfig,
} from './featureConfig';

export async function bootstrapPiFeatures(): Promise<void> {
  await registerFeature(featureConfig);
  await registerFeature(piShadowFeatureConfig);
  await registerFeature(piContextFeatureConfig);
  await registerFeature(piRealtimeFeatureConfig);
  await registerFeature(piNormalizedFeatureConfig);
  await registerFeature(piEnginesFeatureConfig);
  await registerFeature(piHealthFeatureConfig);
  await registerFeature(piInsightsFeatureConfig);
  await registerFeature(piFeedIntelFeatureConfig);
}
