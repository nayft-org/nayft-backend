import { coingeckoApi, CoinGeckoMarketEntry } from '../../utils/coingecko';
import { FilteredCoin } from './models/FilteredCoin';
import { LabeledActiveCoin } from './models/LabeledActiveCoin';
import type { ProviderType } from './models/CoinRawData';

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

export const labeledActiveCoinRepository = {
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
      const count = await LabeledActiveCoin.countDocuments();
      return { count, success: true, page };
    }

    const ops = documents.map((doc) => ({
      updateOne: {
        filter: { id: doc.id },
        update: { $set: doc },
        upsert: true,
      },
    }));

    await LabeledActiveCoin.bulkWrite(ops);
    const count = await LabeledActiveCoin.countDocuments();
    return { count, success: true, page };
  },
};
