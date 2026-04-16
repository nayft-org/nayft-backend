import { CoinRawData, ProviderType } from '../models/CoinRawData';
import { FilteredCoin } from '../models/FilteredCoin';
import mongoose from 'mongoose';
import { config } from '../../../config/env';

export interface RawDataDocument {
  provider: ProviderType;
  provider_coin_id: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  status: string;
  raw_payload: Record<string, unknown>;
  fetched_at: Date;
  provider_timestamp?: Date;
}

function mapToRawDocument(
  provider: ProviderType,
  instrument: Record<string, unknown>,
  providerTimestamp?: Date
): RawDataDocument {
  const fetchedAt = new Date();

  switch (provider) {
    case 'binance': {
      const sym = String(instrument.symbol ?? '');
      return {
        provider: 'binance',
        provider_coin_id: sym,
        symbol: sym,
        base_asset: String(instrument.baseAsset ?? ''),
        quote_asset: String(instrument.quoteAsset ?? ''),
        status: String(instrument.status ?? ''),
        raw_payload: instrument.raw as Record<string, unknown>,
        fetched_at: fetchedAt,
        provider_timestamp: providerTimestamp,
      };
    }
    case 'bybit': {
      const sym = String(instrument.symbol ?? '');
      return {
        provider: 'bybit',
        provider_coin_id: sym,
        symbol: sym,
        base_asset: String(instrument.baseCoin ?? ''),
        quote_asset: String(instrument.quoteCoin ?? ''),
        status: String(instrument.status ?? ''),
        raw_payload: instrument.raw as Record<string, unknown>,
        fetched_at: fetchedAt,
        provider_timestamp: providerTimestamp,
      };
    }
    case 'okx': {
      const instId = String(instrument.instId ?? '');
      return {
        provider: 'okx',
        provider_coin_id: instId,
        symbol: instId,
        base_asset: String(instrument.baseCcy ?? ''),
        quote_asset: String(instrument.quoteCcy ?? ''),
        status: String(instrument.state ?? ''),
        raw_payload: instrument.raw as Record<string, unknown>,
        fetched_at: fetchedAt,
        provider_timestamp: providerTimestamp,
      };
    }
    case 'coinbase': {
      const id = String(instrument.id ?? '');
      return {
        provider: 'coinbase',
        provider_coin_id: id,
        symbol: id,
        base_asset: String(instrument.base_currency ?? ''),
        quote_asset: String(instrument.quote_currency ?? ''),
        status: String(instrument.status ?? ''),
        raw_payload: instrument.raw as Record<string, unknown>,
        fetched_at: fetchedAt,
        provider_timestamp: providerTimestamp,
      };
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

const FILTERED_UPSERT_BATCH = 1000;

async function bulkUpsertFilteredCoinsFromAggDocs(
  docs: Record<string, unknown>[]
): Promise<void> {
  if (docs.length === 0) return;
  const ops = docs.map((d) => {
    const base_asset = d.base_asset as string;
    const provider = d.provider as ProviderType;
    return {
      updateOne: {
        filter: { base_asset, provider },
        update: {
          $set: {
            provider,
            provider_coin_id: d.provider_coin_id as string,
            symbol: d.symbol as string,
            base_asset,
            quote_asset: d.quote_asset as string,
            status: d.status as string,
            raw_payload: d.raw_payload as Record<string, unknown>,
            fetched_at: d.fetched_at as Date,
            ...(d.provider_timestamp != null
              ? { provider_timestamp: d.provider_timestamp as Date }
              : {}),
          },
        },
        upsert: true,
      },
    };
  });
  await FilteredCoin.bulkWrite(ops);
  if (config.coinDataDualWriteEnabled) {
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('filtered_coins').bulkWrite(ops as any, { ordered: false });
    }
  }
}

export const ingestionRepository = {
  async bulkUpsertRawData(
    provider: ProviderType,
    instruments: Record<string, unknown>[],
    providerTimestamp?: Date
  ): Promise<number> {
    const documents = instruments
      .filter((i) => {
        const id =
          provider === 'binance' || provider === 'bybit'
            ? i.symbol
            : provider === 'okx'
              ? i.instId
              : i.id;
        return id && String(id).trim();
      })
      .map((i) => mapToRawDocument(provider, i, providerTimestamp));

    if (documents.length === 0) return 0;

    const ops = documents.map((doc) => ({
      updateOne: {
        filter: { provider: doc.provider, provider_coin_id: doc.provider_coin_id },
        update: { $set: doc },
        upsert: true,
      },
    }));

    const result = await CoinRawData.bulkWrite(ops);
    if (config.coinDataDualWriteEnabled) {
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('coin_raw_data').bulkWrite(ops as any, { ordered: false });
      }
    }
    return result.upsertedCount + result.modifiedCount;
  },

  async createCollectionsIfNotExist(): Promise<void> {
    await CoinRawData.init();
    await FilteredCoin.init();
  },

  async populateFilteredCoins(): Promise<number> {
    const pipeline = [
      { $match: { base_asset: { $exists: true, $ne: '' }, provider: { $exists: true, $ne: '' } } },
      { $sort: { fetched_at: -1 as const } },
      {
        $group: {
          _id: { base_asset: '$base_asset', provider: '$provider' },
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
      // Exclude _id so we never carry coin_raw_data ids into filtered_coins (avoids any merge/replace _id issues).
      { $project: { _id: 0, __v: 0 } },
    ];

    const cursor = CoinRawData.aggregate(pipeline as any[]).cursor({ batchSize: 500 });
    let batch: Record<string, unknown>[] = [];

    for await (const doc of cursor) {
      batch.push(doc as Record<string, unknown>);
      if (batch.length >= FILTERED_UPSERT_BATCH) {
        await bulkUpsertFilteredCoinsFromAggDocs(batch);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await bulkUpsertFilteredCoinsFromAggDocs(batch);
    }

    return await FilteredCoin.countDocuments();
  },
};
