export type CoinFieldOwner =
  | 'coin_registry'
  | 'coingecko_coin_mappings'
  | 'cmc_coin_mappings'
  | 'coin_market_snapshots'
  | 'exchange_listed_assets'
  | 'exchange_asset_ingest_raw'
  | 'coin_news_tagging_map';

export interface FieldOwnership {
  field: string;
  owner: CoinFieldOwner;
  fallback?: CoinFieldOwner;
  mutable: boolean;
  cacheSafe: boolean;
}

export const coinFieldOwnership: ReadonlyArray<FieldOwnership> = [
  { field: 'internalCoinId', owner: 'coin_registry', mutable: false, cacheSafe: true },
  { field: 'coinId', owner: 'coin_registry', fallback: 'cmc_coin_mappings', mutable: true, cacheSafe: true },
  { field: 'symbol', owner: 'coin_registry', fallback: 'coingecko_coin_mappings', mutable: true, cacheSafe: true },
  { field: 'name', owner: 'coin_registry', fallback: 'coingecko_coin_mappings', mutable: true, cacheSafe: true },
  { field: 'rank', owner: 'coin_market_snapshots', fallback: 'cmc_coin_mappings', mutable: true, cacheSafe: true },
  { field: 'price', owner: 'coin_market_snapshots', mutable: true, cacheSafe: true },
  { field: 'percentChange24h', owner: 'coin_market_snapshots', mutable: true, cacheSafe: true },
  { field: 'marketCap', owner: 'coin_market_snapshots', mutable: true, cacheSafe: true },
  { field: 'volume24h', owner: 'coin_market_snapshots', mutable: true, cacheSafe: true },
  { field: 'image', owner: 'coin_market_snapshots', mutable: true, cacheSafe: true },
  {
    field: 'contract_address',
    owner: 'coingecko_coin_mappings',
    fallback: 'coin_market_snapshots',
    mutable: true,
    cacheSafe: true,
  },
  { field: 'keywords', owner: 'coin_news_tagging_map', mutable: true, cacheSafe: true },
];

