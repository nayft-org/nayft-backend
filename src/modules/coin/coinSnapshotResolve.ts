import { config } from '../../config/env';
import { LabeledActiveCoin } from './models/LabeledActiveCoin';

const BATCH_FIELDS =
  'id internalCoinId symbol name image market_cap_rank current_price price_change_percentage_24h';

export type ResolvedCoinSnapshot = {
  coinId: string;
  symbol: string;
  name: string;
  image?: string;
  marketCapRank?: number;
  price: number;
  percentChange24h: number;
  internalCoinId?: string;
};

type SnapshotLean = {
  id: string;
  internalCoinId?: string;
  symbol: string;
  name: string;
  image?: string;
  market_cap_rank?: number;
  current_price?: number;
  price_change_percentage_24h?: number;
};

function rankValue(rank?: number): number {
  return rank != null && rank > 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function isBetterRank(candidate: SnapshotLean, incumbent: SnapshotLean | undefined): boolean {
  if (!incumbent) return true;
  const cr = rankValue(candidate.market_cap_rank);
  const ir = rankValue(incumbent.market_cap_rank);
  if (cr !== ir) return cr < ir;
  const cm = candidate.current_price ?? 0;
  const im = incumbent.current_price ?? 0;
  return cm > im;
}

function registerDoc(
  doc: SnapshotLean,
  byId: Map<string, SnapshotLean>,
  bySymbol: Map<string, SnapshotLean>
): void {
  const idKey = doc.id.toLowerCase();
  const idIncumbent = byId.get(idKey);
  if (isBetterRank(doc, idIncumbent)) {
    byId.set(idKey, doc);
  }

  const symKey = doc.symbol.toLowerCase();
  const symIncumbent = bySymbol.get(symKey);
  if (isBetterRank(doc, symIncumbent)) {
    bySymbol.set(symKey, doc);
  }
}

function docToDto(doc: SnapshotLean): ResolvedCoinSnapshot {
  return {
    coinId: doc.id,
    symbol: (doc.symbol || doc.id).toUpperCase(),
    name: doc.name || doc.symbol || doc.id,
    image: doc.image,
    marketCapRank: doc.market_cap_rank,
    price: doc.current_price ?? 0,
    percentChange24h: doc.price_change_percentage_24h ?? 0,
    internalCoinId: doc.internalCoinId,
  };
}

function resolveDoc(ref: string, byId: Map<string, SnapshotLean>, bySymbol: Map<string, SnapshotLean>): SnapshotLean | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return byId.get(lower) ?? bySymbol.get(lower) ?? null;
}

/**
 * Batch-resolve coin refs (CoinGecko id, symbol, or mixed case) from `coin_market_snapshots`.
 * Duplicate symbols tie-break on lowest `market_cap_rank`, then highest `current_price`.
 */
export async function resolveBatchFromSnapshots(refs: string[]): Promise<ResolvedCoinSnapshot[]> {
  const unique = [...new Set(refs.map((r) => String(r).trim()).filter(Boolean))].slice(0, 50);
  if (unique.length === 0) return [];

  const lowerRefs = unique.map((r) => r.toLowerCase());
  const docs = (await LabeledActiveCoin.find({
    provider: config.coinDataPrimarySnapshotProvider,
    $or: [{ id: { $in: lowerRefs } }, { symbol: { $in: lowerRefs } }],
  })
    .select(BATCH_FIELDS)
    .sort({ market_cap_rank: 1 })
    .lean()
    .exec()) as SnapshotLean[];

  const byId = new Map<string, SnapshotLean>();
  const bySymbol = new Map<string, SnapshotLean>();
  for (const doc of docs) {
    registerDoc(doc, byId, bySymbol);
  }

  const results: ResolvedCoinSnapshot[] = [];
  const seenCoinIds = new Set<string>();

  for (const ref of unique) {
    const doc = resolveDoc(ref, byId, bySymbol);
    if (!doc) continue;
    const dedupeKey = doc.id.toLowerCase();
    if (seenCoinIds.has(dedupeKey)) continue;
    seenCoinIds.add(dedupeKey);
    results.push(docToDto(doc));
  }

  return results;
}

/** Attach `image` from snapshots — prefers `coinId` match, then symbol (rank-aware maps). */
export async function attachImagesToCoins<T extends { coinId: string; symbol: string }>(
  coins: T[]
): Promise<(T & { image?: string })[]> {
  if (coins.length === 0) return coins;

  const refs = [...new Set(coins.flatMap((c) => [c.coinId, c.symbol]).filter(Boolean))];
  const resolved = await resolveBatchFromSnapshots(refs);

  const imageById = new Map<string, string>();
  const imageBySymbol = new Map<string, string>();
  for (const row of resolved) {
    if (!row.image) continue;
    imageById.set(row.coinId.toLowerCase(), row.image);
    imageBySymbol.set(row.symbol.toLowerCase(), row.image);
  }

  return coins.map((coin) => ({
    ...coin,
    image:
      imageById.get(coin.coinId.toLowerCase()) ??
      imageBySymbol.get(coin.symbol.toLowerCase()),
  }));
}
