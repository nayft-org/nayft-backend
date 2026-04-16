import { cmcApi, CmcListingEntry } from '../../utils/cmc';
import mongoose from 'mongoose';
import { config } from '../../config/env';
import { FilteredCoin } from './models/FilteredCoin';
import { CmcLabeledCoin } from './models/CmcLabeledCoin';
import type { ProviderType } from './models/CoinRawData';

function buildSymbolToCoinIdsMap(
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

function mapCmcEntryToDocument(
  entry: CmcListingEntry,
  coinIds: Partial<Record<ProviderType, string>>
) {
  const usd = entry.quote?.USD;
  return {
    id: entry.id,
    name: entry.name ?? '',
    symbol: entry.symbol ?? '',
    slug: entry.slug ?? '',
    cmc_rank: entry.cmc_rank,
    num_market_pairs: entry.num_market_pairs,
    circulating_supply: entry.circulating_supply,
    total_supply: entry.total_supply,
    max_supply: entry.max_supply,
    date_added: entry.date_added,
    last_updated: entry.last_updated,
    quote_usd: usd
      ? {
          price: usd.price,
          volume_24h: usd.volume_24h,
          percent_change_24h: usd.percent_change_24h,
          market_cap: usd.market_cap,
          market_cap_dominance: usd.market_cap_dominance,
          fully_diluted_market_cap: usd.fully_diluted_market_cap,
          last_updated: usd.last_updated,
        }
      : undefined,
    coinIds,
  };
}

export const cmcLabeledCoinRepository = {
  async populateFromCmcPage(
    start: number
  ): Promise<{ count: number; success: boolean; start: number }> {
    const [listingsResult, filteredCoins] = await Promise.all([
      cmcApi.getListingsLatest(start),
      FilteredCoin.find()
        .select('base_asset provider provider_coin_id')
        .lean()
        .exec(),
    ]);

    const symbolToCoinIds = buildSymbolToCoinIdsMap(
      filteredCoins as { base_asset: string; provider: ProviderType; provider_coin_id: string }[]
    );

    const documents = listingsResult.data.map((entry) => {
      const symbolKey = (entry.symbol ?? '').trim().toUpperCase();
      const coinIds = symbolToCoinIds.get(symbolKey) ?? {};
      return mapCmcEntryToDocument(entry, coinIds);
    });

    if (documents.length === 0) {
      const count = await CmcLabeledCoin.countDocuments();
      return { count, success: true, start };
    }

    const ops = documents.map((doc) => ({
      updateOne: {
        filter: { id: doc.id },
        update: { $set: doc },
        upsert: true,
      },
    }));

    await CmcLabeledCoin.bulkWrite(ops);
    if (config.coinDataDualWriteEnabled) {
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('cmc_labeled_coins').bulkWrite(ops as any, { ordered: false });
      }
    }
    const count = await CmcLabeledCoin.countDocuments();
    return { count, success: true, start };
  },
};
