import { fetchAllProviders } from './providers';
import { ingestionRepository } from './repository';
import type { ProviderType } from '../models/CoinRawData';

export interface IngestResult {
  success: boolean;
  providers: Record<ProviderType, number>;
  errors: { provider: string; error: string }[];
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
    return {
      success: hasSuccess,
      providers: counts,
      errors,
    };
  },
};
