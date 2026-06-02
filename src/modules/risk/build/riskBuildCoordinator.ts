import { randomUUID } from 'crypto';
import { redis } from '../../../config/redis';
import { riskConfig, type BuildNamespace } from '../config/riskConfig';
import { riskRedisKeys } from '../cache/riskRedisKeys';
import { freezeRrsUniverse, loadFrozenUniverse } from '../universe/rrsUniverse.service';
import { computeBuildFingerprint } from '../utils/buildFingerprint';
import {
  buildFactorContext,
  computeAllFactorRaws,
  persistFactorRaws,
} from '../factors/factorEngine.service';
import { normalizeCrossSection } from '../normalization/crossSectionalNormalizer';
import { composeCrs, assignCrsRanks } from '../crs/crsComposer';
import { detectMarketRegime, coinRegimeFromCrs, persistRegimes } from '../regime/regimeDetector';
import { validateRiskBuild } from '../validation/riskBuildValidator';
import { publishRiskSnapshot } from '../publish/riskSnapshotPublisher';
import { RiskSnapshot } from '../models/RiskSnapshot';
import { RiskScoreHistory } from '../models/RiskScoreHistory';
import { RrsBuildUniverse } from '../models/RrsBuildUniverse';
import { riskMetrics } from '../../../observability/riskMetrics';
import type { RiskFactorName } from '../types/factorTypes';
import type { FactorRawResult, NormalizedFactorResult } from '../types/factorTypes';

const FACTORS: RiskFactorName[] = [
  'volatility',
  'liquidity',
  'drawdown',
  'fundamentals',
  'news',
];

export type RiskBuildResult = {
  ok: boolean;
  buildId?: string;
  revision?: number;
  error?: string;
  skipped?: boolean;
};

async function acquireBuildLock(namespace: BuildNamespace): Promise<boolean> {
  if (namespace === 'replay') return false;
  const key =
    namespace === 'shadow' ? `${riskRedisKeys.shadowPrefix}build:lock` : riskRedisKeys.buildLock;
  const result = await redis.set(key, String(Date.now()), 'EX', riskConfig.buildLockTtlSec, 'NX');
  return result === 'OK';
}

async function releaseBuildLock(namespace: BuildNamespace): Promise<void> {
  const key =
    namespace === 'shadow' ? `${riskRedisKeys.shadowPrefix}build:lock` : riskRedisKeys.buildLock;
  await redis.del(key);
}

export async function runRiskBuild(options?: {
  buildId?: string;
  namespace?: BuildNamespace;
  replayId?: string;
  skipPublish?: boolean;
}): Promise<RiskBuildResult> {
  const namespace = options?.namespace ?? (riskConfig.shadowMode ? 'shadow' : 'production');
  const started = Date.now();

  if (!riskConfig.buildEnabled && namespace === 'production' && !options?.buildId) {
    return { ok: false, skipped: true, error: 'build_disabled' };
  }

  const locked = await acquireBuildLock(namespace);
  if (!locked && namespace !== 'replay') {
    riskMetrics.buildSkippedOverlapTotal += 1;
    return { ok: false, skipped: true, error: 'lock_not_acquired' };
  }

  const buildId = options?.buildId || randomUUID();

  try {
    const universe = options?.buildId
      ? await loadFrozenUniverse(options.buildId)
      : await freezeRrsUniverse(buildId);

    if (!universe) {
      return { ok: false, error: 'universe_not_found' };
    }

    const buildFingerprint = computeBuildFingerprint({
      buildId: universe.buildId,
      buildCutoffTime: universe.buildCutoffTime,
      universeHash: universe.universeHash,
      sentimentRevision: universe.inputRevisions.sentimentRevision,
    });

    const ctx = await buildFactorContext(universe);
    const raws = await computeAllFactorRaws(ctx);
    await persistFactorRaws(universe.buildId, raws);

    const normalizedByFactor = new Map<RiskFactorName, Map<string, NormalizedFactorResult>>();
    for (const factor of FACTORS) {
      const valueMap = new Map<string, number>();
      for (const [symbol, factorMap] of raws) {
        valueMap.set(symbol, factorMap[factor].raw);
      }
      normalizedByFactor.set(factor, normalizeCrossSection(valueMap, factor));
    }

    const crsMap = new Map<string, ReturnType<typeof composeCrs>>();
    const coinResults: Array<{
      symbol: string;
      internalCoinId?: string;
      crs: ReturnType<typeof composeCrs>;
      regime: string;
      raw: Record<RiskFactorName, FactorRawResult>;
      normalized: Record<RiskFactorName, NormalizedFactorResult>;
    }> = [];

    for (const member of universe.members) {
      const symbol = member.symbol;
      const raw = raws.get(symbol)!;
      const normalized = {} as Record<RiskFactorName, NormalizedFactorResult>;
      for (const f of FACTORS) {
        normalized[f] = normalizedByFactor.get(f)!.get(symbol)!;
      }
      const crs = composeCrs(symbol, normalized, raw);
      crsMap.set(symbol, crs);
      coinResults.push({
        symbol,
        internalCoinId: member.internalCoinId,
        crs,
        regime: 'normal',
        raw,
        normalized,
      });
    }

    assignCrsRanks(crsMap);
    for (const c of coinResults) {
      c.crs = crsMap.get(c.symbol)!;
    }

    const priorRevRaw = await redis.get(
      namespace === 'shadow' ? `${riskRedisKeys.shadowPrefix}revision` : riskRedisKeys.revision
    );
    const priorRevision = priorRevRaw ? parseInt(priorRevRaw, 10) : 0;
    const expectedRevision = priorRevision + 1;

    const validation = validateRiskBuild({
      universeSize: universe.members.length,
      normalizedByFactor,
      crsMap,
      priorRevision: namespace === 'production' ? priorRevision : undefined,
      nextRevision: expectedRevision,
    });

    if (!validation.ok && namespace === 'production' && !riskConfig.shadowMode) {
      console.error('[RiskBuild] validation failed', validation.errors);
      riskMetrics.buildValidationFailedTotal += 1;
      return { ok: false, error: validation.errors.join(',') };
    }

    const marketRegime = await detectMarketRegime(crsMap, expectedRevision, universe.buildId);
    for (const c of coinResults) {
      c.regime = coinRegimeFromCrs(c.crs, marketRegime.marketRegime);
    }

    const computedAt = new Date();

    let publishedRevision = expectedRevision;
    if (!options?.skipPublish) {
      const pub = await publishRiskSnapshot({
        namespace,
        replayId: options?.replayId,
        revision: expectedRevision,
        buildId: universe.buildId,
        buildFingerprint,
        universeHash: universe.universeHash,
        computedAt,
        marketRegime,
        coins: coinResults,
      });
      publishedRevision = pub.manifest.revision;
    }

    const snapshotOps = coinResults.map((c) => ({
      updateOne: {
        filter: { symbol: c.symbol },
        update: {
          $set: {
            symbol: c.symbol,
            internalCoinId: c.internalCoinId,
            buildId: universe.buildId,
            revision: publishedRevision,
            buildFingerprint,
            computedAt,
            crs: c.crs.crs,
            crsRaw: c.crs.crsRaw,
            rank: c.crs.rank,
            percentile: c.crs.percentile,
            confidence: c.crs.confidence,
            factors: {
              volatility: factorSnap(c.raw.volatility, c.normalized.volatility),
              liquidity: factorSnap(c.raw.liquidity, c.normalized.liquidity),
              drawdown: factorSnap(c.raw.drawdown, c.normalized.drawdown),
              fundamentals: factorSnap(c.raw.fundamentals, c.normalized.fundamentals),
              news: factorSnap(c.raw.news, c.normalized.news),
            },
            regime: c.regime,
            sentimentRevision: universe.inputRevisions.sentimentRevision ?? undefined,
            flags: c.crs.flags,
          },
        },
        upsert: true,
      },
    }));

    const batchSize = 500;
    for (let i = 0; i < snapshotOps.length; i += batchSize) {
      await RiskSnapshot.bulkWrite(snapshotOps.slice(i, i + batchSize), { ordered: false });
    }

    const historyDocs = coinResults.map((c) => ({
      symbol: c.symbol,
      buildId: universe.buildId,
      revision: publishedRevision,
      computedAt,
      crs: c.crs.crs,
      rank: c.crs.rank,
      regime: c.regime,
    }));
    for (let i = 0; i < historyDocs.length; i += batchSize) {
      await RiskScoreHistory.insertMany(historyDocs.slice(i, i + batchSize), { ordered: false });
    }

    await persistRegimes(marketRegime, crsMap, publishedRevision, universe.buildId, computedAt);

    await RrsBuildUniverse.updateOne(
      { buildId: universe.buildId },
      { $set: { revision: publishedRevision } }
    );

    if (namespace === 'production' && priorRevision > 0) {
      const { emitRiskAlerts } = await import('../alerts/riskAlertEmitter');
      await emitRiskAlerts(publishedRevision, universe.buildId, priorRevision);
    }

    riskMetrics.lastBuildDurationMs = Date.now() - started;
    riskMetrics.lastRevision = publishedRevision;
    riskMetrics.lastBuildAt = computedAt.toISOString();
    riskMetrics.universeSize = universe.members.length;

    return { ok: true, buildId: universe.buildId, revision: publishedRevision };
  } catch (err) {
    console.error('[RiskBuild] failed', err);
    riskMetrics.buildFailedTotal += 1;
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await releaseBuildLock(namespace);
  }
}

function factorSnap(raw: FactorRawResult, norm: NormalizedFactorResult) {
  return {
    raw: raw.raw,
    normalized: norm.normalized,
    confidence: raw.confidence,
    flags: [...raw.flags, ...norm.flags],
  };
}
