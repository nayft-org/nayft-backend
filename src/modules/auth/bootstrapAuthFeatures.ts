import { registerFeature } from '../../core/feature-system/featureRegistry';
import { Feature } from '../../core/feature-system/feature.model';
import {
  authEmailVerificationEnforceFeature,
  authEmailVerificationFeature,
} from './authFeatureConfigs';

export async function bootstrapAuthVerificationFeatures(): Promise<void> {
  await registerFeature(authEmailVerificationFeature);
  await Feature.findOneAndUpdate(
    { key: authEmailVerificationEnforceFeature.key },
    {
      $set: {
        module: authEmailVerificationEnforceFeature.module,
        controllable: authEmailVerificationEnforceFeature.controllable ?? true,
        category: authEmailVerificationEnforceFeature.category ?? 'free',
        updatedAt: new Date(),
      },
      $setOnInsert: {
        name: authEmailVerificationEnforceFeature.name,
        description: authEmailVerificationEnforceFeature.description,
        isActive: false,
        source: 'code',
      },
    },
    { upsert: true }
  );
}
