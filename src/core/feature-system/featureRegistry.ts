import { Feature } from './feature.model';

export interface FeatureConfig {
  key: string;
  name: string;
  module: string;
  description?: string;
  metadata?: Record<string, unknown>;
  category?: 'free' | 'premium' | 'enterprise';
  controllable?: boolean;
}

/**
 * Registers a feature in the registry. Idempotent: safe on server restart.
 * If feature exists → update metadata; if not → insert new feature.
 */
export async function registerFeature(config: FeatureConfig): Promise<void> {
  const {
    key,
    name,
    module,
    description = '',
    metadata = {},
    category = 'free',
    controllable = false,
  } = config;

  await Feature.findOneAndUpdate(
    { key },
    {
      $set: {
        name,
        module,
        description,
        metadata,
        category,
        controllable,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        isActive: true,
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
}
