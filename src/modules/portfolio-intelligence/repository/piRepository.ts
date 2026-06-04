import { randomUUID } from 'crypto';
import type { NormalizedPosition } from '../contracts/piContracts';
import { PortfolioPosition } from '../models/PortfolioPosition';
import { PortfolioSnapshot, type SnapshotTrigger } from '../models/PortfolioSnapshot';
import { PortfolioAnalyticsSnapshot } from '../models/PortfolioAnalyticsSnapshot';
import type { AnalyticsShellPayload } from '../contracts/piContracts';

export const piRepository = {
  async replacePositionsForUser(
    userId: string,
    positions: NormalizedPosition[],
    ingestRevision: number
  ): Promise<void> {
    const now = new Date();
    await PortfolioPosition.deleteMany({ userId });
    if (positions.length === 0) return;
    await PortfolioPosition.insertMany(
      positions.map((p) => ({
        userId,
        positionKey: p.positionKey,
        internalCoinId: p.internalCoinId,
        coingeckoId: p.coingeckoId,
        symbol: p.symbol,
        name: p.name,
        chain: p.chain,
        contractAddress: p.contractAddress,
        quantity: p.quantity,
        valueUsd: p.valueUsd,
        weightPct: p.weightPct,
        source: p.source,
        venue: p.venue,
        sourceConnectionId: p.sourceConnectionId,
        mappingConfidence: p.mappingConfidence,
        normalizedAt: now,
        ingestRevision,
      }))
    );
  },

  async findPositionsByUser(userId: string): Promise<NormalizedPosition[]> {
    const rows = await PortfolioPosition.find({ userId }).lean();
    return rows.map((r) => ({
      positionKey: r.positionKey,
      internalCoinId: r.internalCoinId,
      coingeckoId: r.coingeckoId,
      symbol: r.symbol,
      name: r.name,
      chain: r.chain,
      contractAddress: r.contractAddress,
      quantity: r.quantity,
      valueUsd: r.valueUsd,
      weightPct: r.weightPct,
      source: r.source,
      venue: r.venue,
      sourceConnectionId: r.sourceConnectionId,
      mappingConfidence: r.mappingConfidence,
    }));
  },

  async appendSnapshot(params: {
    userId: string;
    ingestRevision: number;
    revision: number;
    positions: NormalizedPosition[];
    totalValueUsd: number;
    trigger: SnapshotTrigger;
    ttlDays: number;
  }): Promise<void> {
    const ttlExpiresAt = new Date(Date.now() + params.ttlDays * 24 * 3600 * 1000);
    await PortfolioSnapshot.create({
      userId: params.userId,
      snapshotId: randomUUID(),
      asOf: new Date(),
      revision: params.revision,
      ingestRevision: params.ingestRevision,
      positions: params.positions.map((p) => ({
        positionKey: p.positionKey,
        symbol: p.symbol,
        valueUsd: p.valueUsd,
        weightPct: p.weightPct,
        internalCoinId: p.internalCoinId,
      })),
      totalValueUsd: params.totalValueUsd,
      trigger: params.trigger,
      ttlExpiresAt,
    });
  },

  async saveAnalyticsSnapshot(params: {
    userId: string;
    revision: number;
    inputsRevision: number;
    catalogVersion: number;
    buildFingerprint: string;
    payload: AnalyticsShellPayload;
  }): Promise<void> {
    await PortfolioAnalyticsSnapshot.create({
      userId: params.userId,
      revision: params.revision,
      schemaVersion: 1,
      computedAt: new Date(),
      inputsRevision: params.inputsRevision,
      catalogVersion: params.catalogVersion,
      buildFingerprint: params.buildFingerprint,
      payload: params.payload,
    });
  },
};
