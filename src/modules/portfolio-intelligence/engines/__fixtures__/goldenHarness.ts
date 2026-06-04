import * as fs from 'fs';
import * as path from 'path';
import type { PiEngineContext, PortfolioAnalyticsPayloadV2 } from '../../contracts/piEngineContracts';
import { runAnalyticsPipeline } from '../composition/piAnalyticsPipeline';
import { getActiveFormulaBundle } from '../../config/piFormulaRegistry';
import { validateReplay } from '../math/canonicalJson';

export const GOLDEN_FIXTURE_IDS = [
  'canonical_balanced',
  'canonical_btc_maxi',
  'canonical_meme_heavy',
  'canonical_stable_heavy',
  'canonical_single_asset',
  'canonical_empty',
  'canonical_low_mapping',
  'edge_micro_positions',
  'edge_tie_categories',
  'pathological_rounding',
  'pathological_unmapped',
] as const;

export type GoldenFixtureFile = {
  id: string;
  replayPin?: {
    ingestRevision: number;
    catalogVersion: number;
  };
  positions: PiEngineContext['positions'];
  excludedPositions?: PiEngineContext['excludedPositions'];
  mappings: PiEngineContext['positionMappings'];
  totalValueUsd: number;
};

const FIXTURES_DIR = path.join(__dirname, 'portfolios');
const EXPECTED_DIR = path.join(__dirname, 'expected');

export function loadGoldenFixture(id: string): GoldenFixtureFile {
  const p = path.join(FIXTURES_DIR, `${id}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as GoldenFixtureFile;
}

export function ctxFromGoldenFixture(f: GoldenFixtureFile): PiEngineContext {
  const bundle = getActiveFormulaBundle();
  const eligible = f.positions.filter((p) => p.mappingConfidence >= 0.5);
  const excludedFromPositions = f.positions.filter((p) => p.mappingConfidence < 0.5);
  return {
    userId: 'fixture-user',
    correlationId: `fixture-${f.id}`,
    ingestRevision: f.replayPin?.ingestRevision ?? 1,
    catalogVersion: f.replayPin?.catalogVersion ?? 1,
    taxonomyVersion: bundle.taxonomy,
    positions: eligible,
    excludedPositions: [...excludedFromPositions, ...(f.excludedPositions ?? [])],
    totalValueUsd: f.totalValueUsd,
    formulaBundle: bundle,
    positionMappings: f.mappings,
    replayMode: true,
  };
}

/** Strip volatile fields before canonical replay compare. */
export function stabilizeGoldenPayload(payload: PortfolioAnalyticsPayloadV2): unknown {
  const { computedAt: _c, correlationId: _r, ...rest } = payload;
  return rest;
}

export function runGoldenFixture(id: string): PortfolioAnalyticsPayloadV2 {
  const f = loadGoldenFixture(id);
  return runAnalyticsPipeline(ctxFromGoldenFixture(f));
}

export function expectedPath(id: string): string {
  return path.join(EXPECTED_DIR, `${id}.json`);
}

export function loadExpected(id: string): unknown | null {
  const p = expectedPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as unknown;
}

export function writeExpected(id: string, payload: PortfolioAnalyticsPayloadV2): void {
  fs.mkdirSync(EXPECTED_DIR, { recursive: true });
  fs.writeFileSync(expectedPath(id), `${JSON.stringify(stabilizeGoldenPayload(payload), null, 2)}\n`);
}

export function certifyFixture(id: string): { equal: boolean; diffs: string[]; missingExpected: boolean } {
  const expected = loadExpected(id);
  if (!expected) {
    return { equal: false, diffs: [`missing expected/${id}.json`], missingExpected: true };
  }
  const actual = stabilizeGoldenPayload(runGoldenFixture(id));
  const result = validateReplay(expected, actual);
  return { ...result, missingExpected: false };
}

export function certifyAll(): { passed: string[]; failed: Array<{ id: string; diffs: string[] }> } {
  const passed: string[] = [];
  const failed: Array<{ id: string; diffs: string[] }> = [];
  for (const id of GOLDEN_FIXTURE_IDS) {
    const r = certifyFixture(id);
    if (r.equal) passed.push(id);
    else failed.push({ id, diffs: r.diffs });
  }
  return { passed, failed };
}
