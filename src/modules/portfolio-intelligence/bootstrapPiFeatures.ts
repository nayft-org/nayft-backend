import { registerFeature } from '../../core/feature-system/featureRegistry';
import {
  featureConfig,
  piShadowFeatureConfig,
  piContextFeatureConfig,
  piRealtimeFeatureConfig,
  piNormalizedFeatureConfig,
} from './featureConfig';

export async function bootstrapPiFeatures(): Promise<void> {
  await registerFeature(featureConfig);
  await registerFeature(piShadowFeatureConfig);
  await registerFeature(piContextFeatureConfig);
  await registerFeature(piRealtimeFeatureConfig);
  await registerFeature(piNormalizedFeatureConfig);
}
