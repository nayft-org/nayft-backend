import { Feature } from './feature.model';

export interface FeatureConfig {
  key: string;
  name: string;
  module: string;
  description?: string;
  metadata?: Record<string, unknown>;
  category?: 'free' | 'premium' | 'enterprise';
  controllable?: boolean;
  critical?: boolean;
}

/**
 * Registers a feature in the registry. Idempotent: safe on server restart.
 * New features: values from code. Existing: only module/metadata/category/controllable.
 * Never overwrite: name, description, isActive (admin-controlled).
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

  const updateSet: Record<string, unknown> = {
    module,
    metadata,
    category,
    controllable,
    updatedAt: new Date(),
  };
  if (config.critical !== undefined) updateSet.critical = config.critical;

  await Feature.findOneAndUpdate(
    { key },
    {
      $set: updateSet,
      $setOnInsert: {
        name,
        description,
        isActive: true,
        source: 'code',
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
}
