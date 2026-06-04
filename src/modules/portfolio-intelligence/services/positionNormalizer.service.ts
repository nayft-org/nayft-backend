import { createHash } from 'crypto';
import { identityResolver } from '../../coin/identityResolver';
import { LabeledCoin } from '../../coin/models/LabeledCoin';
import { buildMergedHoldingsForUser } from '../../portfolio/holdingsSync';
import { piConfig } from '../config/piConfig';
import type { NormalizeResult, NormalizedPosition } from '../contracts/piContracts';
import { piRepository } from '../repository/piRepository';
import { portfolioReadAdapter } from '../ports/portfolioReadAdapter';
import { piRedisKeys } from '../cache/piRedisKeys';
import { redis } from '../../../config/redis';
import { piMetrics } from '../../../observability/piMetrics';

function positionKey(symbol: string, chain: string, source: string, venue?: string): string {
  return `${symbol.toLowerCase()}:${chain.toLowerCase()}:${source}:${venue ?? ''}`;
}

async function resolveCoingeckoId(internalCoinId: string | null): Promise<string | null> {
  if (!internalCoinId) return null;
  const row = await LabeledCoin.findOne({ internalCoinId }).select('id').lean().exec();
  if (row?.id) return row.id;
  const byId = await LabeledCoin.findOne({ id: internalCoinId }).select('id').lean().exec();
  return byId?.id ?? null;
}

async function mapRawPosition(
  p: {
    name: string;
    symbol: string;
    quantity: number;
    value: number;
    chain: string;
    source?: 'wallet' | 'exchange';
    venue?: string;
    sourceConnectionId?: string;
  },
  total: number
): Promise<NormalizedPosition> {
  const sym = (p.symbol || '').toUpperCase();
  const resolved = await identityResolver.resolve(sym);
  const internalCoinId = resolved.internalCoinId;
  const coingeckoId = await resolveCoingeckoId(internalCoinId);
  const valueUsd = p.value ?? 0;
  return {
    positionKey: positionKey(sym, p.chain, p.source ?? 'wallet', p.venue),
    internalCoinId,
    coingeckoId,
    symbol: sym,
    name: p.name,
    chain: p.chain,
    quantity: p.quantity,
    valueUsd,
    weightPct: total > 0 ? valueUsd / total : 0,
    source: p.source ?? 'wallet',
    venue: p.venue,
    sourceConnectionId: p.sourceConnectionId,
    mappingConfidence: resolved.confidence,
  };
}

export const positionNormalizerService = {
  async normalizeForUser(userId: string, correlationId: string): Promise<NormalizeResult> {
    const merged = await buildMergedHoldingsForUser(userId);
    const total = merged.totalValue || 0;
    const positions: NormalizedPosition[] = await Promise.all(
      merged.positions.map((p) => mapRawPosition(p, total))
    );

    const ingestRevision = await redis.incr(piRedisKeys.ingestRevision(userId));

    await piRepository.replacePositionsForUser(userId, positions, ingestRevision);

    const holdingPositions = positions.map((pos) => ({
      name: pos.name,
      symbol: pos.symbol,
      quantity: pos.quantity,
      value: pos.valueUsd,
      chain: pos.chain,
      source: pos.source,
      venue: pos.venue,
      sourceConnectionId: pos.sourceConnectionId,
      internalCoinId: pos.internalCoinId ?? undefined,
      mappingConfidence: pos.mappingConfidence,
    }));

    await portfolioReadAdapter.upsertHoldings(userId, {
      totalValue: merged.totalValue,
      absoluteChange24h: merged.absoluteChange24h,
      relativeChange24h: merged.relativeChange24h,
      positions: holdingPositions,
      ingestRevision,
    });

    const lowConf = positions.filter((p) => p.mappingConfidence < 0.5).length;
    if (positions.length > 0) {
      piMetrics.mappingLowConfidence(lowConf / positions.length);
    }

    return {
      userId,
      correlationId,
      ingestRevision,
      positions,
      totalValueUsd: merged.totalValue,
      absoluteChange24h: merged.absoluteChange24h,
      relativeChange24h: merged.relativeChange24h,
    };
  },

  buildFingerprint(userId: string, ingestRevision: number, catalogVersion: number): string {
    return createHash('sha256')
      .update(`${userId}:${ingestRevision}:${catalogVersion}:${piConfig.schemaVersion}`)
      .digest('hex')
      .slice(0, 32);
  },
};
