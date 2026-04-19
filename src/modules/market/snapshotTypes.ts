/**
 * Market snapshot v2 — Redis key `market:v2:snapshot` (JSON string).
 * Built by snapshotBuilder; served by GET /api/market/snapshot (read-only).
 */

export type SparklineInterval = '1h' | '4h' | '1d';

/** Compact sparkline: ≤24 close prices (1d bars), or flat fallback when no kline data */
export type SparklinePayload =
  | { encoding: 'closes'; values: number[] }
  | { encoding: 'flat'; value: number };

export interface SnapshotRow {
  internalCoinId?: string;
  coinId: string;
  symbol: string;
  baseAsset: string;
  name: string;
  rank?: number;
  image?: string;
  price: number;
  percentChange24h: number;
  volume24h: number;
  marketCap?: number;
  sparkline: SparklinePayload;
  sparklineInterval: SparklineInterval;
  /** Coherent with snapshot build; live display uses WebSocket in later phases */
  priceTimestamp?: string;
}

export interface MarketSnapshotV2 {
  version: 2;
  snapshotGeneratedAt: string;
  etag: string;
  snapshotRevision: number;
  tabs: {
    trending: SnapshotRow[];
    topGainers: SnapshotRow[];
    topLosers: SnapshotRow[];
  };
}
