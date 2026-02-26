import { CoinRawData, ProviderType } from '../models/CoinRawData';

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
    return result.upsertedCount + result.modifiedCount;
  },

  async createCollectionsIfNotExist(): Promise<void> {
    await CoinRawData.init();
  },
};
