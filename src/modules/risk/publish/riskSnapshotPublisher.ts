import { createHash } from 'crypto';
import { redis } from '../../../config/redis';
import { cacheHelpers } from '../../../config/redis';
import { riskConfig, type BuildNamespace, resolveRedisPrefix } from '../config/riskConfig';
import { coinRiskKey } from '../cache/riskRedisKeys';
import type { CrsResult } from '../types/factorTypes';
import type { RiskFactorName, FactorRawResult, NormalizedFactorResult } from '../types/factorTypes';
import type { RegimeDetectionResult } from '../regime/regimeDetector';

export type CoinRiskDto = {
  symbol: string;
  internalCoinId?: string;
  crs: number;
  rank: number;
  percentile: number;
  confidence: number;
  regime: string;
  factors: Record<
    RiskFactorName,
    { raw: number; normalized: number; confidence: number; flags: string[] }
  >;
};

export type RiskManifest = {
  revision: number;
  buildId: string;
  buildFingerprint: string;
  shardCount: number;
  shards: Array<{ shardId: number; etag: string; coinCount: number }>;
  universeHash: string;
  complete: boolean;
  publishedAt: string;
  computedAt: string;
  marketRegime: string;
  universeSize: number;
  versions: {
    factorSchemaVersion: string;
    normalizationVersion: string;
    crsFormulaVersion: string;
    regimeLogicVersion: string;
  };
};

export type RiskSnapshotPayload = {
  revision: number;
  buildId: string;
  buildFingerprint: string;
  computedAt: string;
  partial: boolean;
  stale: boolean;
  marketRegime: string;
  universeSize: number;
  coins: CoinRiskDto[];
};

function etagFromJson(json: string): string {
  return createHash('sha256').update(json).digest('hex').slice(0, 32);
}

function prefixKeys(namespace: BuildNamespace, replayId?: string) {
  const p = resolveRedisPrefix(namespace, replayId);
  return {
    revision: `${p}revision`,
    manifest: `${p}snapshot:manifest:v1`,
    manifestStaging: `${p}snapshot:manifest:staging:v1`,
    snapshot: `${p}snapshot:v1`,
    topMovers: `${p}top-movers:v1`,
    regime: `${p}regime:v1`,
    feedChannel: `${p}feed`,
    shardStaging: (id: number) => `${p}snapshot:shard:staging:v1:${id}`,
    shardActive: (id: number) => `${p}snapshot:shard:v1:${id}`,
    coin: (sym: string) => coinRiskKey(sym, p),
  };
}

export async function publishRiskSnapshot(params: {
  namespace: BuildNamespace;
  replayId?: string;
  revision: number;
  buildId: string;
  buildFingerprint: string;
  universeHash: string;
  computedAt: Date;
  marketRegime: RegimeDetectionResult;
  coins: Array<{
    symbol: string;
    internalCoinId?: string;
    crs: CrsResult;
    regime: string;
    raw: Record<RiskFactorName, FactorRawResult>;
    normalized: Record<RiskFactorName, NormalizedFactorResult>;
  }>;
}): Promise<{ manifest: RiskManifest }> {
  const keys = prefixKeys(params.namespace, params.replayId);
  const useShards = params.coins.length > riskConfig.shardThreshold;
  const shardCount = useShards ? riskConfig.shardCount : 1;

  const dtos: CoinRiskDto[] = params.coins.map((c) => ({
    symbol: c.symbol,
    internalCoinId: c.internalCoinId,
    crs: c.crs.crs,
    rank: c.crs.rank,
    percentile: c.crs.percentile,
    confidence: c.crs.confidence,
    regime: c.regime,
    factors: {
      volatility: factorDto(c.raw.volatility, c.normalized.volatility),
      liquidity: factorDto(c.raw.liquidity, c.normalized.liquidity),
      drawdown: factorDto(c.raw.drawdown, c.normalized.drawdown),
      fundamentals: factorDto(c.raw.fundamentals, c.normalized.fundamentals),
      news: factorDto(c.raw.news, c.normalized.news),
    },
  }));

  const sorted = [...dtos].sort((a, b) => {
    const d = b.crs - a.crs;
    if (d !== 0) return d;
    return a.symbol.localeCompare(b.symbol, 'en', { sensitivity: 'base' });
  });

  const shards: RiskManifest['shards'] = [];
  const perShard = Math.ceil(sorted.length / shardCount);

  for (let shardId = 0; shardId < shardCount; shardId++) {
    const slice = sorted.slice(shardId * perShard, (shardId + 1) * perShard);
    const payload: RiskSnapshotPayload = {
      revision: params.revision,
      buildId: params.buildId,
      buildFingerprint: params.buildFingerprint,
      computedAt: params.computedAt.toISOString(),
      partial: false,
      stale: false,
      marketRegime: params.marketRegime.marketRegime,
      universeSize: sorted.length,
      coins: slice,
    };
    const json = JSON.stringify(payload);
    const etag = etagFromJson(json);
    await redis.set(keys.shardStaging(shardId), json);
    shards.push({ shardId, etag, coinCount: slice.length });
  }

  const manifest: RiskManifest = {
    revision: params.revision,
    buildId: params.buildId,
    buildFingerprint: params.buildFingerprint,
    shardCount,
    shards,
    universeHash: params.universeHash,
    complete: true,
    publishedAt: new Date().toISOString(),
    computedAt: params.computedAt.toISOString(),
    marketRegime: params.marketRegime.marketRegime,
    universeSize: sorted.length,
    versions: {
      factorSchemaVersion: riskConfig.factorSchemaVersion,
      normalizationVersion: riskConfig.normalizationVersion,
      crsFormulaVersion: riskConfig.crsFormulaVersion,
      regimeLogicVersion: riskConfig.regimeLogicVersion,
    },
  };

  await redis.set(keys.manifestStaging, JSON.stringify(manifest));

  const revision = await redis.incr(keys.revision);
  params.revision = revision;
  manifest.revision = revision;

  for (const s of shards) {
    const staging = await redis.get(keys.shardStaging(s.shardId));
    if (staging) {
      await redis.set(keys.shardActive(s.shardId), staging);
    }
  }
  await redis.set(keys.manifest, JSON.stringify(manifest));

  const fullPayload: RiskSnapshotPayload = {
    revision: params.revision,
    buildId: params.buildId,
    buildFingerprint: params.buildFingerprint,
    computedAt: params.computedAt.toISOString(),
    partial: false,
    stale: false,
    marketRegime: params.marketRegime.marketRegime,
    universeSize: sorted.length,
    coins: sorted,
  };
  await redis.set(keys.snapshot, JSON.stringify(fullPayload));

  const topRisk = sorted.slice(0, 50);
  const topMovers = {
    generatedAt: params.computedAt.toISOString(),
    revision: params.revision,
    topRisk,
    bottomRisk: [...sorted].reverse().slice(0, 50),
  };
  await cacheHelpers.set(keys.topMovers, topMovers, riskConfig.coinCacheTtlSec);
  await cacheHelpers.set(
    keys.regime,
    {
      regime: params.marketRegime.marketRegime,
      confidence: params.marketRegime.confidence,
      drivers: params.marketRegime.drivers,
      revision: params.revision,
      computedAt: params.computedAt.toISOString(),
    },
    riskConfig.coinCacheTtlSec
  );

  for (const c of sorted) {
    await cacheHelpers.set(keys.coin(c.symbol), c, riskConfig.coinCacheTtlSec);
  }

  if (params.namespace === 'production') {
    await redis.publish(
      keys.feedChannel,
      JSON.stringify({
        revision: params.revision,
        buildId: params.buildId,
        computedAt: params.computedAt.toISOString(),
        shardCount,
      })
    );
  }

  for (let i = 0; i < shardCount; i++) {
    await redis.del(keys.shardStaging(i));
  }
  await redis.del(keys.manifestStaging);

  return { manifest };
}

function factorDto(raw: FactorRawResult, norm: NormalizedFactorResult) {
  return {
    raw: raw.raw,
    normalized: norm.normalized,
    confidence: raw.confidence,
    flags: [...raw.flags, ...norm.flags],
  };
}

export async function getActiveManifest(
  namespace: BuildNamespace = 'production',
  replayId?: string
): Promise<RiskManifest | null> {
  const keys = prefixKeys(namespace, replayId);
  const raw = await redis.get(keys.manifest);
  if (!raw) return null;
  return JSON.parse(raw) as RiskManifest;
}

export async function getRiskSnapshot(
  namespace: BuildNamespace = 'production',
  replayId?: string
): Promise<RiskSnapshotPayload | null> {
  const keys = prefixKeys(namespace, replayId);
  const raw = await redis.get(keys.snapshot);
  if (!raw) return null;
  return JSON.parse(raw) as RiskSnapshotPayload;
}
