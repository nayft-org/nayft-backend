/** Portfolio Intelligence foundation contracts — schemaVersion 1 */

export const PI_SCHEMA_VERSION = 1;
export const PI_JOB_SCHEMA_VERSION = 1;
export const PI_CONTEXT_SCHEMA_VERSION = 1;

export type PiTrigger =
  | 'webhook'
  | 'holdings_refresh'
  | 'wallet_change'
  | 'exchange_sync'
  | 'manual'
  | 'daily';

export type PiRecomputeJob = {
  jobSchemaVersion: number;
  userId: string;
  trigger: PiTrigger;
  correlationId: string;
  enqueuedAt: string;
  ingestRevision?: number;
  attempt?: number;
};

export type NormalizedPosition = {
  positionKey: string;
  internalCoinId: string | null;
  coingeckoId: string | null;
  symbol: string;
  name: string;
  chain: string;
  contractAddress?: string;
  quantity: number;
  valueUsd: number;
  weightPct: number;
  source: 'wallet' | 'exchange';
  venue?: string;
  sourceConnectionId?: string;
  mappingConfidence: number;
};

export type NormalizeResult = {
  userId: string;
  correlationId: string;
  ingestRevision: number;
  positions: NormalizedPosition[];
  totalValueUsd: number;
  absoluteChange24h: number;
  relativeChange24h: number;
};

export type PortfolioContextDto = {
  schemaVersion: number;
  userId: string;
  heldSymbols: string[];
  heldCoinIds: string[];
  weightBySymbol: Record<string, number>;
  ingestRevision: number;
  analyticsRevision: number;
  stale: boolean;
  staleMapping: boolean;
};

export type AnalyticsShellPayload = {
  metrics: Record<string, unknown>;
  insights: Array<{
    id: string;
    type: string;
    evidence: Record<string, unknown>;
    confidence: number;
    modelVersion: string;
  }>;
};

export type PiManifest = {
  revision: number;
  ingestRevision: number;
  schemaVersion: number;
  buildFingerprint: string;
  computedAt: string;
  complete: boolean;
  catalogVersion: number;
};

export type PiFanoutMessage = {
  envelopeVersion: 1;
  type: 'holdings_delta' | 'analytics_revision' | 'portfolio_heartbeat';
  userId: string;
  seq: number;
  revision: number;
  correlationId?: string;
  emittedAt: string;
  payload?: Record<string, unknown>;
};
