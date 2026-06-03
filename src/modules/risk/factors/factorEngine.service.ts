import { LabeledActiveCoin } from '../../coin/models/LabeledActiveCoin';
import { chartRepository } from '../../chart/repository';
import { resolveKlineSymbols } from '../../../config/klineSymbolResolver';
import { riskConfig } from '../config/riskConfig';
import {
  enqueueFactorShardJobs,
  getFactorShardResult,
  waitForFactorShards,
  clearFactorShardResults,
} from '../jobs/riskFactorQueue.service';
import { config } from '../../../config/env';
import { RiskFactorRaw } from '../models/RiskFactorRaw';
import type { RiskFactorName, FactorRawResult, CoinFactorBundle } from '../types/factorTypes';
import type { FrozenUniverse } from '../universe/rrsUniverse.service';
import type { FactorBuildContext, MarketRow, OhlcRow } from './factorContext';
import { computeFundamentalsRaw } from './fundamentals.provider';
import { computeNewsRaw } from './news.provider';
import { computeVolatilityRaw } from './volatility.provider';
import { computeLiquidityRaw } from './liquidity.provider';
import { computeDrawdownRaw } from './drawdown.provider';

let klineSymbolCache: Set<string> | null = null;

async function getKlineSymbols(): Promise<Set<string>> {
  if (!klineSymbolCache) {
    const list = await resolveKlineSymbols();
    klineSymbolCache = new Set(list.map((s) => s.toUpperCase()));
  }
  return klineSymbolCache;
}

async function loadMarketRows(
  symbols: string[],
  buildCutoffTime: Date
): Promise<Map<string, MarketRow>> {
  const lower = symbols.map((s) => s.toLowerCase());
  const rows = await LabeledActiveCoin.find({
    provider: config.coinDataPrimarySnapshotProvider,
    symbol: { $in: lower },
  })
    .select(
      'symbol current_price market_cap market_cap_rank fully_diluted_valuation total_volume price_change_percentage_24h high_24h low_24h last_updated'
    )
    .lean();

  const map = new Map<string, MarketRow>();
  for (const r of rows) {
    const sym = (r.symbol || '').toUpperCase();
    const updated = r.last_updated ? Date.parse(r.last_updated) : 0;
    if (updated > buildCutoffTime.getTime()) continue;
    map.set(sym, {
      symbol: sym,
      current_price: r.current_price,
      market_cap: r.market_cap,
      market_cap_rank: r.market_cap_rank,
      fully_diluted_valuation: r.fully_diluted_valuation,
      total_volume: r.total_volume,
      price_change_percentage_24h: r.price_change_percentage_24h,
      high_24h: r.high_24h,
      low_24h: r.low_24h,
      last_updated: r.last_updated,
    });
  }
  return map;
}

async function loadOhlcBatch(symbols: string[], buildCutoffTime: Date): Promise<Map<string, OhlcRow>> {
  const map = new Map<string, OhlcRow>();
  const klineSet = await getKlineSymbols();
  const eligible = symbols.filter((s) => klineSet.has(s));
  const from = new Date(buildCutoffTime.getTime() - 30 * 24 * 3_600_000);

  await Promise.all(
    eligible.map(async (symbol) => {
      try {
        const pair = `${symbol}USDT`;
        const docs = await chartRepository.findKlines({
          exchange: 'binance',
          symbol: pair,
          interval: '1d',
          from,
          to: buildCutoffTime,
          limit: 45,
        });
        if (!docs.length) return;
        map.set(symbol, {
          closes: docs.map((d) => d.close),
          volumes: docs.map((d) => d.volume),
          highs: docs.map((d) => d.high),
          lows: docs.map((d) => d.low),
          lastOpenTime: docs[docs.length - 1].openTime,
        });
      } catch {
        // skip symbol
      }
    })
  );
  return map;
}

export async function buildFactorContext(universe: FrozenUniverse): Promise<FactorBuildContext> {
  const symbols = universe.members.map((m) => m.symbol);
  const [marketBySymbol, ohlcBySymbol] = await Promise.all([
    loadMarketRows(symbols, universe.buildCutoffTime),
    loadOhlcBatch(symbols, universe.buildCutoffTime),
  ]);
  return {
    universe,
    marketBySymbol,
    ohlcBySymbol,
    buildCutoffTime: universe.buildCutoffTime,
  };
}

async function computeAllFactorRawsInline(
  ctx: FactorBuildContext
): Promise<Map<string, Record<RiskFactorName, FactorRawResult>>> {
  const out = new Map<string, Record<RiskFactorName, FactorRawResult>>();

  for (const member of ctx.universe.members) {
    const symbol = member.symbol;
    const fundamentals = computeFundamentalsRaw(symbol, ctx);
    const volatility = computeVolatilityRaw(symbol, ctx);
    const liquidity = computeLiquidityRaw(symbol, ctx);
    const drawdown = computeDrawdownRaw(symbol, ctx);
    const news = await computeNewsRaw(symbol, ctx);

    out.set(symbol, {
      fundamentals,
      volatility,
      liquidity,
      drawdown,
      news,
    });
  }
  return out;
}

export async function computeAllFactorRaws(
  ctx: FactorBuildContext
): Promise<Map<string, Record<RiskFactorName, FactorRawResult>>> {
  const shardThreshold = riskConfig.factorShardThreshold;
  if (ctx.universe.members.length >= shardThreshold) {
    return computeAllFactorRawsSharded(ctx);
  }
  return computeAllFactorRawsInline(ctx);
}

async function computeAllFactorRawsSharded(
  ctx: FactorBuildContext
): Promise<Map<string, Record<RiskFactorName, FactorRawResult>>> {
  const shardCount = Math.min(16, Math.ceil(ctx.universe.members.length / 500));
  const perShard = Math.ceil(ctx.universe.members.length / shardCount);
  const shards: Array<{ shardId: number; symbols: string[] }> = [];

  for (let shardId = 0; shardId < shardCount; shardId++) {
    const slice = ctx.universe.members.slice(shardId * perShard, (shardId + 1) * perShard);
    if (slice.length === 0) continue;
    shards.push({ shardId, symbols: slice.map((m) => m.symbol) });
  }

  await clearFactorShardResults(ctx.universe.buildId);
  await enqueueFactorShardJobs(ctx.universe.buildId, shards, ctx.buildCutoffTime);

  const ready = await waitForFactorShards(ctx.universe.buildId, shards.length);
  if (!ready) {
    console.warn('[RiskBuild] factor shard timeout — falling back to inline compute');
    return computeAllFactorRawsInline(ctx);
  }

  const merged = new Map<string, Record<RiskFactorName, FactorRawResult>>();
  for (const shard of shards) {
    const raw = await getFactorShardResult(ctx.universe.buildId, shard.shardId);
    if (!raw) continue;
    const parsed = JSON.parse(raw) as Record<string, Record<RiskFactorName, FactorRawResult>>;
    for (const [sym, factors] of Object.entries(parsed)) {
      merged.set(sym, factors);
    }
  }
  await clearFactorShardResults(ctx.universe.buildId);
  return merged;
}

export async function persistFactorRaws(
  buildId: string,
  raws: Map<string, Record<RiskFactorName, FactorRawResult>>
): Promise<void> {
  const ops: Parameters<typeof RiskFactorRaw.bulkWrite>[0] = [];
  for (const [symbol, factors] of raws) {
    for (const [factor, result] of Object.entries(factors) as [RiskFactorName, FactorRawResult][]) {
      ops.push({
        updateOne: {
          filter: { buildId, symbol, factor },
          update: {
            $set: {
              buildId,
              symbol,
              factor,
              raw: result.raw,
              confidence: result.confidence,
              flags: result.flags,
              factorSnapshotTime: result.factorSnapshotTime,
              buildCutoffTime: result.buildCutoffTime,
              stalenessMs: result.stalenessMs,
              invalid: result.invalid,
              providerVersion: riskConfig.providerVersions[factor],
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (ops.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < ops.length; i += batchSize) {
      await RiskFactorRaw.bulkWrite(ops.slice(i, i + batchSize), { ordered: false });
    }
  }
}

export function toCoinBundles(
  raws: Map<string, Record<RiskFactorName, FactorRawResult>>
): Map<string, CoinFactorBundle> {
  const bundles = new Map<string, CoinFactorBundle>();
  for (const [symbol, factors] of raws) {
    bundles.set(symbol, {
      symbol,
      factors,
      normalized: {} as CoinFactorBundle['normalized'],
    });
  }
  return bundles;
}
