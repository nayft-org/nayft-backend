import { coingeckoApi } from '../../utils/coingecko';
import { FilteredCoin } from './models/FilteredCoin';
import { LabeledCoin } from './models/LabeledCoin';
import type { ProviderType } from './models/CoinRawData';

const BATCH_SIZE = 500;

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

export const labeledCoinRepository = {
  async populateFromCoinGeckoAndFilteredCoins(): Promise<{ count: number; success: boolean }> {
    const [coinGeckoList, filteredCoins] = await Promise.all([
      coingeckoApi.getCoinsList(),
      FilteredCoin.find()
        .select('base_asset provider provider_coin_id')
        .lean()
        .exec(),
    ]);

    const symbolToCoinIds = buildSymbolToCoinIdsMap(
      filteredCoins as { base_asset: string; provider: ProviderType; provider_coin_id: string }[]
    );

    const documents = coinGeckoList.map((coin) => {
      const symbolKey = (coin.symbol ?? '').trim().toUpperCase();
      const coinIds = symbolToCoinIds.get(symbolKey) ?? {};
      return {
        id: coin.id,
        symbol: coin.symbol ?? '',
        name: coin.name ?? '',
        coinIds,
      };
    });

    let totalUpserted = 0;
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      const ops = batch.map((doc) => ({
        updateOne: {
          filter: { id: doc.id },
          update: { $set: doc },
          upsert: true,
        },
      }));
      const result = await LabeledCoin.bulkWrite(ops);
      totalUpserted += result.upsertedCount + result.modifiedCount;
    }

    const count = await LabeledCoin.countDocuments();
    return { count, success: true };
  },
};
