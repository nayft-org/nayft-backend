import axios from 'axios';
import { config } from '../../../config/env';
import { redis } from '../../../config/redis';
import { cacheHelpers } from '../../../config/redis';
import { piConfig } from '../config/piConfig';
import { piRedisKeys } from '../cache/piRedisKeys';
import { CoinCategoryCatalog } from '../models/CoinCategoryCatalog';
import { CoinCategoryMapping } from '../models/CoinCategoryMapping';
import { LabeledActiveCoin } from '../../coin/models/LabeledActiveCoin';

type CoingeckoCategory = { category_id: string; name: string };

async function fetchCategoriesList(): Promise<CoingeckoCategory[]> {
  const headers: Record<string, string> = {};
  if (config.coinGeckoApiKey) {
    headers['x-cg-pro-api-key'] = config.coinGeckoApiKey;
    headers['x-cg-demo-api-key'] = config.coinGeckoApiKey;
  }
  const { data } = await axios.get<CoingeckoCategory[]>(
    `${config.coinGeckoBaseUrl}/coins/categories/list`,
    { headers, timeout: 30_000 }
  );
  return Array.isArray(data) ? data : [];
}

export async function runCategoryCatalogSync(): Promise<number> {
  const lock = await redis.set(piRedisKeys.buildLock, '1', 'EX', piConfig.buildLockTtlSec, 'NX');
  if (lock !== 'OK') {
    console.log('[PI CategorySync] skipped — lock held');
    return 0;
  }

  try {
    const catalogVersion = await redis.incr(piRedisKeys.globalRevision);
    const categories = await fetchCategoriesList();

    await CoinCategoryCatalog.deleteMany({ catalogVersion });
    if (categories.length > 0) {
      await CoinCategoryCatalog.insertMany(
        categories.map((c) => ({
          categoryId: c.category_id,
          name: c.name,
          catalogVersion,
        }))
      );
    }

    await cacheHelpers.set(
      piRedisKeys.categoryCatalog(catalogVersion),
      { catalogVersion, categories },
      piConfig.categoryCatalogTtlSec
    );

    const coins = await LabeledActiveCoin.find({})
      .select('id internalCoinId symbol')
      .limit(500)
      .lean();

    let mapped = 0;
    for (const coin of coins) {
      const internalCoinId = coin.internalCoinId || coin.id;
      if (!internalCoinId) continue;
      try {
        const { data: detail } = await axios.get<{ categories?: string[] }>(
          `${config.coinGeckoBaseUrl}/coins/${coin.id}`,
          {
            headers: config.coinGeckoApiKey
              ? { 'x-cg-pro-api-key': config.coinGeckoApiKey }
              : {},
            timeout: 15_000,
            params: { localization: false, tickers: false, market_data: false, community_data: false, developer_data: false },
          }
        );
        const cats = detail?.categories ?? [];
        if (cats.length === 0) continue;
        const primary = cats[0];
        const primaryId =
          categories.find((c) => c.name === primary)?.category_id ?? primary.toLowerCase().replace(/\s+/g, '-');
        await CoinCategoryMapping.findOneAndUpdate(
          { internalCoinId, catalogVersion },
          {
            $set: {
              primaryCategoryId: primaryId,
              secondaryCategoryIds: cats.slice(1).map((name) =>
                categories.find((c) => c.name === name)?.category_id ?? name
              ),
              confidence: 1,
              source: 'coingecko',
              catalogVersion,
            },
          },
          { upsert: true }
        );
        mapped += 1;
        await new Promise((r) => setTimeout(r, 1200));
      } catch {
        /* rate limit — continue */
      }
    }

    console.log('[PI CategorySync] complete', { catalogVersion, categories: categories.length, mapped });
    return catalogVersion;
  } finally {
    await redis.del(piRedisKeys.buildLock);
  }
}

if (require.main === module) {
  runCategoryCatalogSync()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
