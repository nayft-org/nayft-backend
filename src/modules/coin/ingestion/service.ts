import { fetchAllProviders } from './providers';
import { ingestionRepository } from './repository';
import type { ProviderType } from '../models/CoinRawData';
import { FilteredCoin } from '../models/FilteredCoin';
import { CoinMaster } from '../../news/models';
import mongoose from 'mongoose';
import { config } from '../../../config/env';

export interface IngestResult {
  success: boolean;
  providers: Record<ProviderType, number>;
  exchange_listed_assets_count: number;
  filtered_coins_count: number;
  coin_news_tagging_map_upserted: number;
  coinmasters_upserted: number;
  errors: { provider: string; error: string }[];
}

function normalizeSymbol(symbol: string): string {
  const segment = symbol.split(/[-/]/)[0]?.trim() ?? '';
  return segment.toUpperCase();
}

async function syncCoinMastersFromFilteredCoins(): Promise<number> {
  const baseAssets = (await FilteredCoin.distinct('base_asset', {
    base_asset: { $exists: true, $nin: [null, ''] },
  })) as string[];

  const seen = new Set<string>();
  let upsertedOrUpdated = 0;

  for (const raw of baseAssets) {
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    const sym = normalizeSymbol(trimmed);
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);

    const keywords = [trimmed.toLowerCase()];

    const res = await CoinMaster.updateOne(
      { symbol: sym },
      {
        $setOnInsert: { symbol: sym },
        $set: {
          name: sym,
          keywords,
        },
      },
      { upsert: true }
    ).exec();

    // For Mongoose >=6, `modifiedCount`/`upsertedCount` exist; fall back to `nModified` / `upserted` if present.
    const modified =
      // @ts-expect-error legacy driver fields
      (res.modifiedCount ?? res.nModified ?? 0);
    // @ts-expect-error legacy driver fields
    const upserted = res.upsertedCount ?? (res.upserted ? 1 : 0);

    if (modified > 0 || upserted > 0) {
      upsertedOrUpdated += 1;
    }

    if (config.coinDataDualWriteEnabled) {
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('coinmasters').updateOne(
          { symbol: sym },
          {
            $setOnInsert: { symbol: sym },
            $set: {
              name: sym,
              keywords,
              migratedAt: new Date(),
              migrationVersion: 'coin-domain-v1',
            },
          },
          { upsert: true }
        );
      }
    }
  }

  return upsertedOrUpdated;
}

export const ingestionService = {
  async ingestFromAllProviders(): Promise<IngestResult> {
    const { results, errors } = await fetchAllProviders();
    const counts: Record<ProviderType, number> = {
      binance: 0,
      bybit: 0,
      okx: 0,
      coinbase: 0,
    };

    await ingestionRepository.createCollectionsIfNotExist();

    for (const result of results) {
      const provider = result.provider;
      const instruments = result.instruments;

      if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
        errors.push({ provider, error: 'Empty or invalid instruments array' });
        continue;
      }

      const asRecords = instruments.map((i) => i as unknown as Record<string, unknown>);
      const count = await ingestionRepository.bulkUpsertRawData(
        provider,
        asRecords,
        result.provider_timestamp
      );
      counts[provider] = count;
    }

    const hasSuccess = Object.values(counts).some((c) => c > 0);
    const filteredCount = hasSuccess ? await ingestionRepository.populateFilteredCoins() : 0;
    const coinMastersUpserted =
      hasSuccess && filteredCount > 0 ? await syncCoinMastersFromFilteredCoins() : 0;

    return {
      success: hasSuccess,
      providers: counts,
      exchange_listed_assets_count: filteredCount,
      filtered_coins_count: filteredCount,
      coin_news_tagging_map_upserted: coinMastersUpserted,
      coinmasters_upserted: coinMastersUpserted,
      errors,
    };
  },
};
