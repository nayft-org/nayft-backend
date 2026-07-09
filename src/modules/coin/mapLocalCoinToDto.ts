export type LocalCoinDbRow = {
  internalCoinId?: string;
  coinId: string;
  symbol: string;
  name: string;
  rank?: number;
  price?: number;
  percentChange24h?: number;
};

export type LocalCoinSnapshotRow = {
  id: string;
  symbol?: string;
  name?: string;
  internalCoinId?: string;
  image?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
};

/**
 * Build a coin profile DTO from Coin collection and/or LabeledActiveCoin snapshot.
 * Snapshot-only rows (Explore list source) must succeed without a Coin document.
 */
export function mapLocalCoinToDto(params: {
  dbCoin?: LocalCoinDbRow | null;
  snapshot?: LocalCoinSnapshotRow | null;
  internalCoinId: string | null;
}) {
  const { dbCoin, snapshot, internalCoinId } = params;
  const resolvedCoinId = dbCoin?.coinId ?? snapshot?.id ?? '';
  const resolvedSymbol = (dbCoin?.symbol || snapshot?.symbol || '').toUpperCase();
  const resolvedName = dbCoin?.name || snapshot?.name || resolvedSymbol;

  if (!resolvedCoinId || !resolvedSymbol || !resolvedName) {
    return null;
  }

  return {
    internalCoinId: dbCoin?.internalCoinId ?? snapshot?.internalCoinId ?? internalCoinId,
    coinId: resolvedCoinId,
    symbol: resolvedSymbol,
    name: resolvedName,
    rank: dbCoin?.rank ?? snapshot?.market_cap_rank ?? 0,
    price: dbCoin?.price ?? snapshot?.current_price ?? 0,
    percentChange24h:
      dbCoin?.percentChange24h ?? snapshot?.price_change_percentage_24h ?? 0,
    marketCap: snapshot?.market_cap,
    volume24h: snapshot?.total_volume,
    image: snapshot?.image,
  };
}
