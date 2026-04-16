import { coingeckoApi, CoinGeckoMarketEntry } from '../../utils/coingecko';
import { config } from '../../config/env';
import mongoose from 'mongoose';
import { FilteredCoin } from './models/FilteredCoin';
import { LabeledActiveCoin } from './models/LabeledActiveCoin';
import type { ProviderType } from './models/CoinRawData';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSymbolToRelatedIdsMap(
  filteredCoins: { base_asset: string; provider: ProviderType; provider_coin_id: string }[]
): Map<string, Partial<Record<ProviderType, string>>> {
  const map = new Map<string, Partial<Record<ProviderType, string>>>();
  for (const fc of filteredCoins) {
    const key = fc.base_asset.trim().toUpperCase();
    if (!key) continue;
    const existing = map.get(key) ?? {};
    existing[fc.provider] = fc.provider_coin_id;
    map.set(key, existing);
  }
  return map;
}

function mapMarketEntryToDocument(
  entry: CoinGeckoMarketEntry,
  relatedIDs: Partial<Record<ProviderType, string>>
) {
  return {
    provider: config.coinDataPrimarySnapshotProvider,
    id: entry.id,
    symbol: entry.symbol ?? '',
    name: entry.name ?? '',
    image: entry.image,
    current_price: entry.current_price,
    market_cap: entry.market_cap,
    market_cap_rank: entry.market_cap_rank,
    fully_diluted_valuation: entry.fully_diluted_valuation,
    total_volume: entry.total_volume,
    high_24h: entry.high_24h,
    low_24h: entry.low_24h,
    price_change_24h: entry.price_change_24h,
    price_change_percentage_24h: entry.price_change_percentage_24h,
    market_cap_change_24h: entry.market_cap_change_24h,
    market_cap_change_percentage_24h: entry.market_cap_change_percentage_24h,
    circulating_supply: entry.circulating_supply,
    total_supply: entry.total_supply,
    max_supply: entry.max_supply,
    ath: entry.ath,
    ath_change_percentage: entry.ath_change_percentage,
    ath_date: entry.ath_date,
    atl: entry.atl,
    atl_change_percentage: entry.atl_change_percentage,
    atl_date: entry.atl_date,
    last_updated: entry.last_updated,
    relatedIDs,
  };
}

const LIST_PAGE_FIELDS =
  'id internalCoinId symbol name image current_price market_cap_rank price_change_percentage_24h market_cap total_volume';

export interface LabeledActiveCoinListEntry {
  id: string;
  internalCoinId?: string;
  symbol: string;
  name: string;
  image?: string;
  current_price?: number;
  market_cap_rank?: number;
  price_change_percentage_24h?: number;
  market_cap?: number;
  total_volume?: number;
}

export const labeledActiveCoinRepository = {
  async findPage(params: {
    limit: number;
    cursor?: number;
  }): Promise<{
    coins: LabeledActiveCoinListEntry[];
    nextCursor: number | null;
  }> {
    const { limit, cursor } = params;
    const filter: Record<string, unknown> = { provider: config.coinDataPrimarySnapshotProvider };
    if (cursor != null) {
      filter.market_cap_rank = { $gt: cursor };
    }
    const results = await LabeledActiveCoin.find(filter)
      .select(LIST_PAGE_FIELDS)
      .sort({ market_cap_rank: 1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const hasMore = results.length > limit;
    const coins = hasMore ? results.slice(0, limit) : results;
    const nextCursor =
      hasMore && coins.length > 0
        ? (coins[coins.length - 1] as { market_cap_rank?: number }).market_cap_rank ?? null
        : null;

    return {
      coins: coins as LabeledActiveCoinListEntry[],
      nextCursor,
    };
  },

  async findByCoinId(coinId: string): Promise<{
    id: string;
    image?: string;
    current_price?: number;
    market_cap?: number;
    market_cap_rank?: number;
    fully_diluted_valuation?: number;
    total_volume?: number;
    high_24h?: number;
    low_24h?: number;
    circulating_supply?: number;
    total_supply?: number | null;
    max_supply?: number | null;
    ath?: number;
    ath_date?: string;
    atl?: number;
    atl_date?: string;
  } | null> {
    const fields =
      'id image current_price market_cap market_cap_rank fully_diluted_valuation total_volume high_24h low_24h circulating_supply total_supply max_supply ath ath_date atl atl_date';
    const actualId = coinId.includes('=') ? coinId.split('=')[1] : coinId;
    const byId = await LabeledActiveCoin.findOne({
      id: actualId,
      provider: config.coinDataPrimarySnapshotProvider,
    })
      .select(fields)
      .lean()
      .exec();
    if (byId) return byId as any;

    const symbolKey = actualId.trim().toUpperCase();
    if (!symbolKey) return null;
    const escaped = escapeRegex(symbolKey);
    const bySymbol = await LabeledActiveCoin.find({
      provider: config.coinDataPrimarySnapshotProvider,
      symbol: { $regex: new RegExp(`^${escaped}$`, 'i') },
    })
      .select(fields)
      .sort({ market_cap_rank: 1 })
      .limit(1)
      .lean()
      .exec();
    return bySymbol[0] ?? null;
  },

  async populateFromCoinGeckoMarketsPage(
    page: number
  ): Promise<{ count: number; success: boolean; page: number }> {
    const [marketEntries, filteredCoins] = await Promise.all([
      coingeckoApi.getCoinsMarkets(page),
      FilteredCoin.find()
        .select('base_asset provider provider_coin_id')
        .lean()
        .exec(),
    ]);

    const symbolToRelatedIds = buildSymbolToRelatedIdsMap(
      filteredCoins as { base_asset: string; provider: ProviderType; provider_coin_id: string }[]
    );

    const documents = marketEntries.map((entry) => {
      const symbolKey = (entry.symbol ?? '').trim().toUpperCase();
      const relatedIDs = symbolToRelatedIds.get(symbolKey) ?? {};
      return mapMarketEntryToDocument(entry, relatedIDs);
    });

    if (documents.length === 0) {
      const count = await LabeledActiveCoin.countDocuments({
        provider: config.coinDataPrimarySnapshotProvider,
      });
      return { count, success: true, page };
    }

    const ops = documents.map((doc) => ({
      updateOne: {
        filter: { id: doc.id, provider: doc.provider },
        update: { $set: doc },
        upsert: true,
      },
    }));

    await LabeledActiveCoin.bulkWrite(ops);
    if (config.coinDataDualWriteEnabled) {
      const db = mongoose.connection.db;
      if (db) {
        const legacyOps = documents.map((doc) => ({
          updateOne: {
            filter: { id: doc.id },
            update: { $set: { ...doc } },
            upsert: true,
          },
        }));
        await db.collection('labeled_active_coins').bulkWrite(legacyOps as any, { ordered: false });
      }
    }
    const count = await LabeledActiveCoin.countDocuments({
      provider: config.coinDataPrimarySnapshotProvider,
    });
    return { count, success: true, page };
  },
};
