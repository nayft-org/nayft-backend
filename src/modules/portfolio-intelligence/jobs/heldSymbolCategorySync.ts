import axios from 'axios';
import { config } from '../../../config/env';
import { redis } from '../../../config/redis';
import { piRedisKeys } from '../cache/piRedisKeys';
import { PortfolioPosition } from '../models/PortfolioPosition';
import { CoinCategoryMapping } from '../models/CoinCategoryMapping';
import { CoinCategoryCatalog } from '../models/CoinCategoryCatalog';
import { categoryGovernanceService } from '../services/categoryGovernance.service';

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

export async function runHeldSymbolCategorySync(): Promise<number> {
  const catalogVersion = parseInt((await redis.get(piRedisKeys.globalRevision)) || '1', 10) || 1;

  const heldSymbols = await PortfolioPosition.distinct('symbol', {
    valueUsd: { $gt: 0 },
    internalCoinId: { $ne: null },
  });

  const heldCoins = await PortfolioPosition.distinct('internalCoinId', {
    valueUsd: { $gt: 0 },
    internalCoinId: { $ne: null },
  });

  const positions = await PortfolioPosition.find({
    valueUsd: { $gt: 0 },
    coingeckoId: { $ne: null },
  })
    .select('internalCoinId coingeckoId symbol')
    .lean();

  const categories = await CoinCategoryCatalog.find({ catalogVersion })
    .select('categoryId name')
    .lean();
  const categoryList = categories.map((c) => ({ category_id: c.categoryId, name: c.name }));
  if (categoryList.length === 0) {
    try {
      categoryList.push(...(await fetchCategoriesList()));
    } catch {
      /* use empty list */
    }
  }

  let mapped = 0;
  const seen = new Set<string>();

  for (const pos of positions) {
    const internalCoinId = pos.internalCoinId;
    if (!internalCoinId || seen.has(internalCoinId)) continue;
    seen.add(internalCoinId);

    const existing = await CoinCategoryMapping.findOne({ internalCoinId, catalogVersion }).lean();
    if (existing && existing.confidence >= 0.8) continue;

    const geckoId = pos.coingeckoId;
    if (!geckoId) continue;

    try {
      const { data: detail } = await axios.get<{ categories?: string[] }>(
        `${config.coinGeckoBaseUrl}/coins/${geckoId}`,
        {
          headers: config.coinGeckoApiKey ? { 'x-cg-pro-api-key': config.coinGeckoApiKey } : {},
          timeout: 15_000,
          params: {
            localization: false,
            tickers: false,
            market_data: false,
            community_data: false,
            developer_data: false,
          },
        }
      );
      const cats = detail?.categories ?? [];
      if (cats.length === 0) continue;

      const primary = cats[0];
      const primaryId =
        categoryList.find((c) => c.name === primary)?.category_id ??
        primary.toLowerCase().replace(/\s+/g, '-');

      await CoinCategoryMapping.findOneAndUpdate(
        { internalCoinId, catalogVersion },
        {
          $set: {
            primaryCategoryId: primaryId,
            secondaryCategoryIds: cats.slice(1).map(
              (name) =>
                categoryList.find((c) => c.name === name)?.category_id ??
                name.toLowerCase().replace(/\s+/g, '-')
            ),
            confidence: 1,
            source: 'held_symbol_sync',
            catalogVersion,
          },
        },
        { upsert: true }
      );

      await categoryGovernanceService.recordAudit({
        internalCoinId,
        issue: 'held_symbol_mapped',
        catalogVersion,
        details: { symbol: pos.symbol, geckoId, primaryId, heldSymbols: heldSymbols.length },
      });

      mapped += 1;
      await new Promise((r) => setTimeout(r, 800));
    } catch {
      /* rate limit — continue */
    }
  }

  console.log('[PI HeldSymbolCategorySync]', {
    catalogVersion,
    heldSymbols: heldSymbols.length,
    heldCoins: heldCoins.length,
    mapped,
  });
  return mapped;
}

if (require.main === module) {
  runHeldSymbolCategorySync()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
