import { registerFeature } from '../../core/feature-system/featureRegistry';
import { interestProfileFeatureConfig } from './featureConfig';

export async function bootstrapInterestProfileFeatures(): Promise<void> {
  await registerFeature(interestProfileFeatureConfig);
}
