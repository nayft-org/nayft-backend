import { randomUUID } from 'crypto';
import { LabeledActiveCoin } from '../../coin/models/LabeledActiveCoin';
import { redis } from '../../../config/redis';
import { sentimentConfig } from '../../sentiment/config/sentimentConfig';
import { riskConfig } from '../config/riskConfig';
import { RrsBuildUniverse, type IRrsUniverseMember } from '../models/RrsBuildUniverse';
import { computeUniverseHash, floorTo15MinUtc } from '../utils/buildFingerprint';
import { config } from '../../../config/env';

export type FrozenUniverse = {
  buildId: string;
  buildCutoffTime: Date;
  universeHash: string;
  members: IRrsUniverseMember[];
  inputRevisions: {
    sentimentRevision: number | null;
    marketDataAsOf: string;
    ohlcCutoffTime: string;
  };
};

export async function freezeRrsUniverse(buildId?: string): Promise<FrozenUniverse> {
  const buildCutoffTime = floorTo15MinUtc(new Date());
  const ohlcCutoffTime = new Date(buildCutoffTime.getTime() - 60_000);

  const coins = await LabeledActiveCoin.find({
    provider: config.coinDataPrimarySnapshotProvider,
    market_cap: { $gte: riskConfig.universeMinMarketCap },
    market_cap_rank: { $exists: true, $ne: null },
  })
    .select('symbol internalCoinId market_cap market_cap_rank last_updated')
    .sort({ market_cap_rank: 1 })
    .limit(riskConfig.universeMaxSize)
    .lean();

  const members: IRrsUniverseMember[] = coins
    .map((c) => ({
      symbol: (c.symbol || '').toUpperCase(),
      internalCoinId: c.internalCoinId,
      marketCapRank: c.market_cap_rank,
      marketCap: c.market_cap,
      eligibilityFlags: ['tier_a'],
    }))
    .filter((m) => m.symbol);

  const universeHash = computeUniverseHash(members);
  const id = buildId || randomUUID();

  let sentimentRevision: number | null = null;
  try {
    const rev = await redis.get(sentimentConfig.revisionKey);
    sentimentRevision = rev ? parseInt(rev, 10) : null;
  } catch {
    sentimentRevision = null;
  }

  const marketDataAsOf =
    coins.reduce((max, c) => {
      const t = c.last_updated ? Date.parse(c.last_updated) : 0;
      return t > max ? t : max;
    }, 0) || buildCutoffTime.getTime();

  const frozen: FrozenUniverse = {
    buildId: id,
    buildCutoffTime,
    universeHash,
    members,
    inputRevisions: {
      sentimentRevision,
      marketDataAsOf: new Date(marketDataAsOf).toISOString(),
      ohlcCutoffTime: ohlcCutoffTime.toISOString(),
    },
  };

  await RrsBuildUniverse.create({
    buildId: id,
    buildCutoffTime,
    universeHash,
    universeSize: members.length,
    tier: 'A',
    members,
    inputRevisions: frozen.inputRevisions,
    factorSchemaVersion: riskConfig.factorSchemaVersion,
    normalizationVersion: riskConfig.normalizationVersion,
    crsFormulaVersion: riskConfig.crsFormulaVersion,
    regimeLogicVersion: riskConfig.regimeLogicVersion,
    providerVersions: { ...riskConfig.providerVersions },
    frozenAt: new Date(),
  });

  return frozen;
}

export async function loadFrozenUniverse(buildId: string): Promise<FrozenUniverse | null> {
  const doc = await RrsBuildUniverse.findOne({ buildId }).lean();
  if (!doc) return null;
  return {
    buildId: doc.buildId,
    buildCutoffTime: doc.buildCutoffTime,
    universeHash: doc.universeHash,
    members: doc.members,
    inputRevisions: doc.inputRevisions,
  };
}
