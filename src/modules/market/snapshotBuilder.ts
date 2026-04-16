import { createHash } from 'crypto';
import zlib from 'zlib';
import pLimit from 'p-limit';
import { redis } from '../../config/redis';
import { streamConfig } from '../../config/streamConfig';
import { coinmarketcapApi } from '../../utils/coinmarketcap';
import { chartRepository } from '../chart/repository';
import { Coin } from '../coin/model';
import { LabeledActiveCoin } from '../coin/models/LabeledActiveCoin';
import { marketRepository } from './repository';
import type { MarketSnapshotV2, SnapshotRow, SparklinePayload } from './snapshotTypes';
import {
  MARKET_SNAPSHOT_BUILD_LOCK_KEY,
  MARKET_SNAPSHOT_REVISION_KEY,
  MARKET_SNAPSHOT_V2_KEY,
} from './snapshotRedisKeys';

const SPARKLINE_POINTS = 24;
const LOCK_TTL_SEC = 240;
const MAX_GZIP_BYTES = 20 * 1024; // budget: ≤20KB gzip typical
const MAX_JSON_BYTES = 50 * 1024; // hard cap uncompressed

interface RawCoin {
  coinId: string;
  symbol: string;
  name: string;
  rank: number;
  price: number;
  percentChange24h: number;
  marketCap: number;
  volume24h: number;
}

type MapCmcRow = Record<string, unknown>;

function mapCoinMarketCapData(cmcData: unknown): RawCoin[] {
  const data = cmcData as { data?: unknown };
  if (!data?.data) return [];

  const rows: MapCmcRow[] = Array.isArray(data.data)
    ? (data.data as MapCmcRow[])
    : (Object.values(data.data as Record<string, MapCmcRow>) as MapCmcRow[]);

  return rows.map((item) => ({
    coinId: String(item.id ?? ''),
    symbol: String(item.symbol ?? ''),
    name: String(item.name ?? ''),
    rank: Number(item.cmc_rank ?? 0),
    price: Number((item.quote as { USD?: { price?: number } })?.USD?.price ?? 0),
    percentChange24h: Number((item.quote as { USD?: { percent_change_24h?: number } })?.USD?.percent_change_24h ?? 0),
    marketCap: Number((item.quote as { USD?: { market_cap?: number } })?.USD?.market_cap ?? 0),
    volume24h: Number((item.quote as { USD?: { volume_24h?: number } })?.USD?.volume_24h ?? 0),
  }));
}

async function attachImages<T extends { symbol: string }>(coins: T[]): Promise<(T & { image?: string })[]> {
  if (coins.length === 0) return coins;
  const lowerSymbols = coins.map((c) => c.symbol.toLowerCase());
  const docs = await LabeledActiveCoin.find(
    { symbol: { $in: lowerSymbols } },
    { symbol: 1, image: 1, _id: 0 }
  )
    .lean()
    .exec();
  const imageMap = new Map<string, string>();
  for (const doc of docs) {
    if (doc.image) imageMap.set(doc.symbol.toLowerCase(), doc.image);
  }
  return coins.map((c) => ({ ...c, image: imageMap.get(c.symbol.toLowerCase()) }));
}

function downsampleCloses(closes: number[], n: number): number[] {
  if (closes.length <= n) return closes;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / Math.max(n - 1, 1)) * (closes.length - 1));
    out.push(closes[idx]);
  }
  return out;
}

async function buildSparklineForSymbol(baseAsset: string, fallbackPrice: number): Promise<SparklinePayload> {
  const exchange = streamConfig.exchanges[0] || 'binance';
  const symbol = baseAsset.trim().toUpperCase();
  const to = new Date();
  const from = new Date(to.getTime() - 45 * 24 * 60 * 60 * 1000);

  let klines = await chartRepository.findKlines({
    exchange,
    symbol,
    interval: '1d',
    from,
    to,
    limit: 48,
  });
  if (klines.length < 2) {
    klines = await chartRepository.aggregateKlinesFromTrades({
      exchange,
      symbol,
      interval: '1d',
      from,
      to,
      limit: 48,
    });
  }

  let closes = klines.map((k) => k.close).filter((x) => Number.isFinite(x) && x > 0);
  if (closes.length < 2) {
    const v = fallbackPrice > 0 ? fallbackPrice : 0;
    return { encoding: 'flat', value: v };
  }
  closes = downsampleCloses(closes, SPARKLINE_POINTS);
  return { encoding: 'closes', values: closes };
}

async function bulkUpsertCoins(coins: RawCoin[]): Promise<void> {
  if (coins.length === 0) return;
  const bulkOps = coins.map((coin) => ({
    updateOne: {
      filter: { coinId: coin.coinId },
      update: {
        $set: {
          coinId: coin.coinId,
          symbol: coin.symbol,
          name: coin.name,
          rank: coin.rank,
          price: coin.price,
          percentChange24h: coin.percentChange24h,
          lastUpdated: new Date(),
          symbolLower: coin.symbol.toLowerCase(),
          nameLower: coin.name.toLowerCase(),
        },
      },
      upsert: true,
    },
  }));
  await Coin.bulkWrite(bulkOps, { ordered: false });
}

async function fetchTrendingRows(): Promise<RawCoin[]> {
  try {
    const cmcResponse = await coinmarketcapApi.getListingsLatest(20);
    return mapCoinMarketCapData(cmcResponse);
  } catch (e) {
    console.warn('[snapshotBuilder] CMC listings failed, using DB fallback', e);
    const dbCoins = await marketRepository.findTrending(20);
    return dbCoins.map((coin) => ({
      coinId: coin.coinId,
      symbol: coin.symbol,
      name: coin.name,
      rank: coin.rank,
      price: coin.price,
      percentChange24h: coin.percentChange24h,
      marketCap: 0,
      volume24h: 0,
    }));
  }
}

async function fetchGainersLosers(): Promise<{ gainers: RawCoin[]; losers: RawCoin[] }> {
  try {
    const cmcResponse = await coinmarketcapApi.getTrendingGainersLosers();
    const coins = mapCoinMarketCapData(cmcResponse);
    const gainers = coins
      .filter((c) => c.percentChange24h > 0)
      .sort((a, b) => b.percentChange24h - a.percentChange24h)
      .slice(0, 10);
    const losers = coins
      .filter((c) => c.percentChange24h < 0)
      .sort((a, b) => a.percentChange24h - b.percentChange24h)
      .slice(0, 10);
    return { gainers, losers };
  } catch (e) {
    console.warn('[snapshotBuilder] CMC gainers/losers failed, using DB', e);
    const [g, l] = await Promise.all([marketRepository.findTopGainers(10), marketRepository.findTopLosers(10)]);
    const mapDb = (coin: (typeof g)[0]): RawCoin => ({
      coinId: coin.coinId,
      symbol: coin.symbol,
      name: coin.name,
      rank: coin.rank,
      price: coin.price,
      percentChange24h: coin.percentChange24h,
      marketCap: 0,
      volume24h: 0,
    });
    return { gainers: g.map(mapDb), losers: l.map(mapDb) };
  }
}

async function prefetchSparklines(
  coins: { symbol: string; price: number }[],
  cache: Map<string, SparklinePayload>
): Promise<void> {
  const limit = pLimit(4);
  const uniqueBases = [...new Set(coins.map((c) => c.symbol.toUpperCase()))];
  for (let i = 0; i < uniqueBases.length; i += 8) {
    const chunk = uniqueBases.slice(i, i + 8);
    await Promise.all(
      chunk.map((base) => limit(async () => {
        if (cache.has(base)) return;
        const coin = coins.find((c) => c.symbol.toUpperCase() === base);
        const fallback = coin?.price ?? 0;
        const sp = await buildSparklineForSymbol(base, fallback);
        cache.set(base, sp);
      }))
    );
  }
}

function toSnapshotRows(
  coins: (RawCoin & { image?: string })[],
  sparklineCache: Map<string, SparklinePayload>
): SnapshotRow[] {
  const now = new Date().toISOString();
  return coins.map((c) => {
    const base = c.symbol.toUpperCase();
    return {
      coinId: c.coinId,
      symbol: c.symbol,
      baseAsset: base,
      name: c.name,
      rank: c.rank,
      image: c.image,
      price: c.price,
      percentChange24h: c.percentChange24h,
      volume24h: c.volume24h,
      marketCap: c.marketCap,
      sparkline: sparklineCache.get(base) ?? { encoding: 'flat', value: c.price },
      sparklineInterval: '1d' as const,
      priceTimestamp: now,
    };
  });
}

function etagFromJson(json: string): string {
  return createHash('sha256').update(json).digest('hex').slice(0, 32);
}

/**
 * Build snapshot and write Redis `market:v2:snapshot`. Keeps last-good data on failure.
 * Uses distributed lock to avoid concurrent builds across processes.
 */
export async function runMarketSnapshotBuild(): Promise<{ ok: boolean; error?: string }> {
  const lock = await redis.set(MARKET_SNAPSHOT_BUILD_LOCK_KEY, String(Date.now()), 'EX', LOCK_TTL_SEC, 'NX');
  if (lock !== 'OK') {
    return { ok: false, error: 'lock_not_acquired' };
  }

  try {
    const [trendingRaw, gl] = await Promise.all([fetchTrendingRows(), fetchGainersLosers()]);

    const allForWrite = [...trendingRaw, ...gl.gainers, ...gl.losers];
    const byId = new Map<string, RawCoin>();
    for (const c of allForWrite) {
      if (c.coinId) byId.set(c.coinId, c);
    }
    await bulkUpsertCoins([...byId.values()]);

    const [trendingEnriched, gainersEnriched, losersEnriched] = await Promise.all([
      attachImages(trendingRaw),
      attachImages(gl.gainers),
      attachImages(gl.losers),
    ]);

    const sparklineCache = new Map<string, SparklinePayload>();
    await prefetchSparklines(
      [...trendingEnriched, ...gainersEnriched, ...losersEnriched],
      sparklineCache
    );

    const trending = toSnapshotRows(trendingEnriched, sparklineCache);
    const topGainers = toSnapshotRows(gainersEnriched, sparklineCache);
    const topLosers = toSnapshotRows(losersEnriched, sparklineCache);

    const revision = await redis.incr(MARKET_SNAPSHOT_REVISION_KEY);
    const snapshotGeneratedAt = new Date().toISOString();

    const bodyForEtag = {
      version: 2 as const,
      snapshotGeneratedAt,
      snapshotRevision: revision,
      tabs: { trending, topGainers, topLosers },
    };
    const etag = etagFromJson(JSON.stringify(bodyForEtag));

    const finalSnapshot: MarketSnapshotV2 = {
      ...bodyForEtag,
      etag,
    };
    const json = JSON.stringify(finalSnapshot);

    const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));
    if (gz.length > MAX_GZIP_BYTES) {
      console.warn(
        `[snapshotBuilder] gzip size ${gz.length} exceeds soft budget ${MAX_GZIP_BYTES}; still publishing (tune sparklines)`
      );
    }
    if (json.length > MAX_JSON_BYTES) {
      throw new Error(`snapshot JSON ${json.length} exceeds hard limit ${MAX_JSON_BYTES}`);
    }

    await redis.set(MARKET_SNAPSHOT_V2_KEY, json);
    console.log(
      `[snapshotBuilder] published revision=${revision} jsonBytes=${json.length} gzipBytes=${gz.length} etag=${finalSnapshot.etag.slice(0, 12)}…`
    );
    return { ok: true };
  } catch (err) {
    console.error('[snapshotBuilder] build failed (last-good snapshot retained):', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await redis.del(MARKET_SNAPSHOT_BUILD_LOCK_KEY).catch(() => {});
  }
}
