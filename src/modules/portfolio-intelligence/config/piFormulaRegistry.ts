import * as fs from 'fs';
import * as path from 'path';

export type PiFormulaBundle = {
  allocation: string;
  risk: string;
  narrative: string;
  concentration: string;
  diversification: string;
  stablecoin: string;
  health: string;
  identity: string;
  insights: string;
  taxonomy: string;
};

const FORMULAS_DIR = path.join(__dirname, '../formulas');

function loadJson<T>(relPath: string): T {
  const full = path.join(FORMULAS_DIR, relPath);
  return JSON.parse(fs.readFileSync(full, 'utf8')) as T;
}

const bundlePin = process.env.PI_FORMULA_BUNDLE_PIN?.trim();
const activeDir = bundlePin ? `v${bundlePin.replace(/^v/, '')}` : 'v1';

export function getActiveFormulaBundle(): PiFormulaBundle {
  return {
    allocation: 'v1',
    risk: 'v1',
    narrative: 'v1',
    concentration: 'v1',
    diversification: 'v1',
    stablecoin: 'v1',
    health: 'v1',
    identity: 'v1',
    insights: 'v1',
    taxonomy: 'taxonomy_v1',
  };
}

export function loadTaxonomyV1() {
  return loadJson<{
    version: string;
    buckets: string[];
    coingeckoPatterns: Record<string, string[]>;
    symbolOverrides: Record<string, string>;
  }>(`${activeDir}/taxonomy_v1.json`);
}

export function loadCategoryRiskV1() {
  return loadJson<{
    version: string;
    weights: Record<string, number>;
    labels: Array<{ maxTenths: number; label: string }>;
  }>(`${activeDir}/category_risk_v1.json`);
}

export function loadNarrativeMapV1() {
  return loadJson<{ version: string; bucketToNarrative: Record<string, string> }>(
    `${activeDir}/narrative_map_v1.json`
  );
}

export function loadIdentityRulesV1() {
  return loadJson<{
    version: string;
    rules: Array<Record<string, unknown>>;
    default: { id: string; name: string };
  }>(`${activeDir}/identity_rules_v1.json`);
}

export function loadInsightTemplatesV1() {
  return loadJson<{
    version: string;
    severityWeight: Record<string, number>;
    templates: Array<Record<string, unknown>>;
    maxInsights: number;
  }>(`${activeDir}/insight_templates_v1.json`);
}

export function formulaBundleFingerprint(bundle: PiFormulaBundle): string {
  return Object.entries(bundle)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}
