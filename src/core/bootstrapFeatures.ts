import path from 'path';
import fs from 'fs';
import { registerFeature } from './feature-system/featureRegistry';

async function registerI18nFeature(): Promise<void> {
  await registerFeature({
    key: 'multi_language',
    name: 'Multi-language',
    module: 'i18n',
    description: 'Backend-driven translation for news, search, and comments',
    controllable: true,
  });
}

const MODULES_DIR = path.join(__dirname, '..', 'modules');

/**
 * Scans all modules and registers features from featureConfig.ts if present.
 * Idempotent — safe on server restart.
 */
export async function bootstrapFeatures(): Promise<void> {
  if (!fs.existsSync(MODULES_DIR)) {
    console.warn('[FeatureSystem] modules dir not found:', MODULES_DIR);
    return;
  }

  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  const moduleNames = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);

  for (const modName of moduleNames) {
    const base = path.join(MODULES_DIR, modName);
    const tsPath = path.join(base, 'featureConfig.ts');
    const jsPath = path.join(base, 'featureConfig.js');

    const configPath = fs.existsSync(tsPath) ? tsPath : fs.existsSync(jsPath) ? jsPath : null;
    if (!configPath) continue;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(configPath);
      if (mod.featureConfig) {
        await registerFeature(mod.featureConfig);
      }
    } catch (err) {
      console.warn(`[FeatureSystem] Failed to load featureConfig from ${modName}:`, err);
    }
  }

  // Register core system feature (API errors, etc.)
  await registerFeature({
    key: 'system',
    name: 'System',
    module: 'core',
    description: 'Core system events (API errors, etc.)',
    critical: true,
  });

  await registerI18nFeature();
}
