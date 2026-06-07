import axios from 'axios';
import { chartRepository } from './repository';
import type { KlineRecord, MarketTrendPoint } from './repository';
import type { KlineInterval } from './model';
import { streamConfig } from '../../config/streamConfig';
import { LabeledActiveCoin } from '../coin/models/LabeledActiveCoin';
import {
  withResponseCache,
  buildChartMarketTrendKey,
  buildChartMarketTrendV2Key,
  buildChartKlinesKey,
} from '../../utils/responseCache';
import { config } from '../../config/env';
import { coinmarketcapApi } from '../../utils/coinmarketcap';

const QUOTE_SUFFIXES = ['USDT', 'USDC', 'BUSD', 'USD'];

function normalizeChartSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase();
  if (!symbol) return '';
  for (const suffix of QUOTE_SUFFIXES) {
    if (symbol.endsWith(suffix) && symbol.length > suffix.length) {
      return symbol.slice(0, -suffix.length);
    }
  }
  return symbol;
}

/** Interval to milliseconds for bucketing trades */
const INTERVAL_MS: Record<KlineInterval, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

/** Short TTL so overview charts refresh often enough to feel “live” when polling. */
const MARKET_TREND_CACHE_TTL = 20;
const KL_TTL: Record<KlineInterval, number> = {
  '1m': 30,
  '5m': 45,
  '15m': 60,
  '1h': 90,
  '4h': 120,
  '1d': 120,
  '1w': 180,
};

/** Last-resort synthetic when no Binance BTC series exists: linear cap ramp from CMC 24h change. */
function buildLinearSyntheticPoints(opts: {
  from: Date;
  to: Date;
  limit: number;
  startValue: number;
  endValue: number;
}): MarketTrendPoint[] {
  const n = Math.max(2, Math.min(opts.limit, 240));
  const spanMs = opts.to.getTime() - opts.from.getTime();
  const out: MarketTrendPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const ms = opts.from.getTime() + spanMs * t;
    const value = opts.startValue + (opts.endValue - opts.startValue) * t;
    out.push({ openTime: new Date(ms), value });
  }
  return out;
}

async function getCmcTotalMarketCap(maxCoins: number): Promise<{
  latestValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
} | null> {
  if (!config.cmcApiKey?.trim()) return null;
  try {
    const cmcResponse = await coinmarketcapApi.getListingsLatest(maxCoins, 1);
    const raw = cmcResponse?.data;
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length === 0) return null;

    let sumCap = 0;
    let weightedPct = 0;
    for (const item of arr) {
      const cap = Number(item?.quote?.USD?.market_cap ?? 0);
      const pct = Number(item?.quote?.USD?.percent_change_24h ?? 0);
      if (!Number.isFinite(cap) || cap <= 0) continue;
      sumCap += cap;
      weightedPct += cap * pct;
    }
    if (sumCap <= 0) return null;

    const relativeChange24h = weightedPct / sumCap;
    const latestValue = sumCap;
    const rel = relativeChange24h / 100;
    const previousValue = Math.abs(rel + 1) > 1e-9 ? latestValue / (1 + rel) : latestValue;
    const absoluteChange24h = latestValue - previousValue;
    return { latestValue, absoluteChange24h, relativeChange24h };
  } catch {
    return null;
  }
}

const BINANCE_INTERVAL: Record<KlineInterval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

function toBinancePair(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!s) return '';
  for (const suffix of QUOTE_SUFFIXES) {
    if (s.endsWith(suffix) && s.length > suffix.length) return s;
  }
  return `${s}USDT`;
}

/** Public Binance klines when Mongo has no candles (no worker required). */
async function fetchBinanceKlinesRest(params: {
  pair: string;
  interval: KlineInterval;
  from: Date;
  to: Date;
  limit: number;
}): Promise<KlineRecord[] | null> {
  const iv = BINANCE_INTERVAL[params.interval] ?? '1m';
  const lim = Math.min(Math.max(params.limit, 2), 1000);
  const search = new URLSearchParams({
    symbol: params.pair,
    interval: iv,
    startTime: String(params.from.getTime()),
    endTime: String(params.to.getTime()),
    limit: String(lim),
  });
  try {
    const { data } = await axios.get<unknown[]>(
      `https://api.binance.com/api/v3/klines?${search.toString()}`,
      { timeout: 15_000 }
    );
    if (!Array.isArray(data) || data.length < 2) return null;
    return data.map((row) => {
      const r = row as unknown[];
      return {
        openTime: new Date(Number(r[0])),
        open: parseFloat(String(r[1])),
        high: parseFloat(String(r[2])),
        low: parseFloat(String(r[3])),
        close: parseFloat(String(r[4])),
        volume: parseFloat(String(r[5])),
      };
    });
  } catch {
    return null;
  }
}

/** @deprecated use fetchBinanceKlinesRest */
async function fetchBinanceBtcKlinesRest(params: {
  interval: KlineInterval;
  from: Date;
  to: Date;
  limit: number;
}): Promise<KlineRecord[] | null> {
  return fetchBinanceKlinesRest({ pair: 'BTCUSDT', ...params });
}

/**
 * Real OHLCV shape from Binance BTC (Mongo or public REST), scaled so the last point matches
 * total USD market cap. Used when aggregate multi-coin OHLCV is missing.
 */
async function tryBtcProxyMarketTrend(params: {
  exchange: string;
  interval: KlineInterval;
  from: Date;
  to: Date;
  limit: number;
  latestTotalUsd: number;
}): Promise<MarketTrendPoint[] | null> {
  const { exchange, interval, from, to, limit, latestTotalUsd } = params;
  if (latestTotalUsd <= 0) return null;

  /** Prefer public Binance first — avoids multi-second Mongo timeouts on cold/offline DB. */
  let klines: KlineRecord[] =
    (await fetchBinanceBtcKlinesRest({
      interval,
      from,
      to,
      limit: Math.min(limit, 1000),
    })) ?? [];

  if (klines.length < 2) {
    try {
      klines = await chartRepository.findKlines({
        exchange,
        symbol: 'BTC',
        interval,
        from,
        to,
        limit,
      });
    } catch {
      klines = [];
    }
  }
  if (klines.length < 2) {
    try {
      klines = await chartRepository.aggregateKlinesFromTrades({
        exchange,
        symbol: 'BTC',
        interval,
        from,
        to,
        limit,
      });
    } catch {
      klines = [];
    }
  }

  if (klines.length < 2) return null;
  const lastClose = klines[klines.length - 1].close;
  if (!Number.isFinite(lastClose) || lastClose <= 0) return null;
  return klines.map((k) => ({
    openTime: k.openTime,
    value: latestTotalUsd * (k.close / lastClose),
  }));
}

/** BTC/USDT closes (USD) when cap series is unavailable; shows global market *shape* when DB+CMC fail. */
async function tryBinanceBtcPriceOnlyTrend(params: {
  interval: KlineInterval;
  from: Date;
  to: Date;
  limit: number;
}): Promise<{
  points: MarketTrendPoint[];
  latestValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
} | null> {
  const klines = await fetchBinanceBtcKlinesRest({
    interval: params.interval,
    from: params.from,
    to: params.to,
    limit: Math.min(params.limit, 1000),
  });
  if (!klines || klines.length < 2) return null;
  const points: MarketTrendPoint[] = klines.map((k) => ({
    openTime: k.openTime,
    value: k.close,
  }));
  const first = klines[0].close;
  const last = klines[klines.length - 1].close;
  const absoluteChange24h = last - first;
  const relativeChange24h = first > 0 ? (absoluteChange24h / first) * 100 : 0;
  return {
    points,
    latestValue: last,
    absoluteChange24h,
    relativeChange24h,
  };
}

/**
 * When Mongo has no OHLCV for the market-trend window (common in dev), approximate the
 * overview from the same CMC listings feed used by GET /api/market/trending.
 */
async function tryCmcSyntheticMarketTrend(params: {
  from: Date;
  to: Date;
  limit: number;
  maxCoins: number;
}): Promise<{
  points: MarketTrendPoint[];
  latestValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
} | null> {
  const snap = await getCmcTotalMarketCap(params.maxCoins);
  if (!snap) return null;
  const previousValue = snap.latestValue - snap.absoluteChange24h;
  const points = buildLinearSyntheticPoints({
    from: params.from,
    to: params.to,
    limit: params.limit,
    startValue: previousValue,
    endValue: snap.latestValue,
  });
  return {
    points,
    latestValue: snap.latestValue,
    absoluteChange24h: snap.absoluteChange24h,
    relativeChange24h: snap.relativeChange24h,
  };
}

async function buildMarketTrendPayload(params: {
  interval?: KlineInterval;
  from?: string;
  to?: string;
  exchange?: string;
  limit?: number;
  maxCoins?: number;
  useBatchedKlines: boolean;
}) {
  const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
  const interval = params.interval || '1m';
  const limit = Math.min(Math.max(params.limit ?? 240, 30), 720);
  const maxCoins = Math.min(Math.max(params.maxCoins ?? 25, 5), 100);

  const now = new Date();
  const bucketMs = INTERVAL_MS[interval];
  const to = params.to ? new Date(params.to) : now;
  const from = params.from
    ? new Date(params.from)
    : new Date(to.getTime() - bucketMs * (limit + Math.ceil(limit * 0.5)));

  /** When Mongo is down or times out, fall back to stream symbols + CMC/Binance-only paths (no 500). */
  let activeCoins: Array<{
    symbol?: string;
    market_cap?: number;
    market_cap_change_percentage_24h?: number;
    market_cap_rank?: number;
  }> = [];
  const labeledQuery = LabeledActiveCoin.find({
    provider: config.coinDataPrimarySnapshotProvider,
    symbol: { $exists: true, $ne: '' },
  })
    .select('symbol market_cap market_cap_change_percentage_24h market_cap_rank')
    .sort({ market_cap_rank: 1 })
    .limit(maxCoins)
    .maxTimeMS(8000)
    .lean();
  try {
    activeCoins = await Promise.race([
      labeledQuery,
      new Promise<typeof activeCoins>((resolve) => setTimeout(() => resolve([]), 5000)),
    ]);
  } catch (err) {
    console.warn('[buildMarketTrendPayload] LabeledActiveCoin unavailable; using non-DB fallbacks', err);
    activeCoins = [];
  }

  const fromDb = activeCoins
    .map((coin) => {
      const rawCap = Number(coin.market_cap);
      const marketCap = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : 1;
      return {
        symbol: String(coin.symbol || '').trim().toUpperCase(),
        marketCap,
        marketCapChange24h: Number(coin.market_cap_change_percentage_24h || 0),
      };
    })
    .filter((coin) => Boolean(coin.symbol));

  const uniqueStreamSymbols = [
    ...new Set(
      streamConfig.kline.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    ),
  ].slice(0, maxCoins);

  const useFallbackConstituents = fromDb.length === 0;
  const constituents = useFallbackConstituents
    ? uniqueStreamSymbols.map((symbol) => ({
        symbol,
        marketCap: 1,
        marketCapChange24h: 0,
      }))
    : fromDb;

  /** Only when DB gave no ranked coins — runs in parallel with aggregate kline query below. */
  const binanceBtcTrendPromise = useFallbackConstituents
    ? tryBinanceBtcPriceOnlyTrend({ interval, from, to, limit })
    : Promise.resolve<
        Awaited<ReturnType<typeof tryBinanceBtcPriceOnlyTrend>>
      >(null);

  const findParams = {
    exchange,
    interval,
    from,
    to,
    limit,
    constituents: constituents.map(({ symbol, marketCap }) => ({ symbol, marketCap })),
  };

  const findTrendPromise = params.useBatchedKlines
    ? chartRepository.findMarketTrendBatched(findParams)
    : chartRepository.findMarketTrend(findParams);

  let repoPoints: MarketTrendPoint[] = [];
  try {
    repoPoints = await Promise.race([
      findTrendPromise,
      new Promise<MarketTrendPoint[]>((resolve) => setTimeout(() => resolve([]), 8000)),
    ]);
  } catch (err) {
    console.warn('[buildMarketTrendPayload] findMarketTrend* unavailable; using CMC/Binance fallbacks', err);
    repoPoints = [];
  }

  let latestValue = constituents.reduce((sum, coin) => sum + coin.marketCap, 0);
  let absoluteChange24h = 0;
  let relativeChange24h = 0;
  let previousValueForSynth = 0;

  if (useFallbackConstituents) {
    if (repoPoints.length >= 1) {
      latestValue = repoPoints[repoPoints.length - 1].value;
    } else {
      latestValue = 0;
    }
    if (repoPoints.length >= 2) {
      const firstVal = repoPoints[0].value;
      const lastVal = repoPoints[repoPoints.length - 1].value;
      absoluteChange24h = lastVal - firstVal;
      relativeChange24h = firstVal > 0 ? (absoluteChange24h / firstVal) * 100 : 0;
    }
  } else {
    previousValueForSynth = constituents.reduce((sum, coin) => {
      const divisor = 1 + coin.marketCapChange24h / 100;
      if (!Number.isFinite(divisor) || divisor <= 0) return sum;
      return sum + coin.marketCap / divisor;
    }, 0);
    absoluteChange24h = latestValue - previousValueForSynth;
    relativeChange24h = previousValueForSynth > 0 ? (absoluteChange24h / previousValueForSynth) * 100 : 0;
  }

  let points = repoPoints;

  if (points.length === 0 && useFallbackConstituents) {
    const fastBtc = await binanceBtcTrendPromise;
    if (fastBtc && fastBtc.points.length >= 2) {
      points = fastBtc.points;
      latestValue = fastBtc.latestValue;
      absoluteChange24h = fastBtc.absoluteChange24h;
      relativeChange24h = fastBtc.relativeChange24h;
    }
  }

  if (points.length === 0) {
    let cmcSnap: Awaited<ReturnType<typeof getCmcTotalMarketCap>> = null;
    let scaleUsd: number | null = null;
    if (useFallbackConstituents) {
      cmcSnap = await getCmcTotalMarketCap(maxCoins);
      scaleUsd = cmcSnap?.latestValue ?? null;
    } else if (Number.isFinite(latestValue) && latestValue > 0) {
      scaleUsd = latestValue;
    }

    if (scaleUsd != null && scaleUsd > 0) {
      const btcProxy = await tryBtcProxyMarketTrend({
        exchange,
        interval,
        from,
        to,
        limit,
        latestTotalUsd: scaleUsd,
      });
      if (btcProxy && btcProxy.length >= 2) {
        points = btcProxy;
        if (useFallbackConstituents && cmcSnap) {
          latestValue = cmcSnap.latestValue;
          absoluteChange24h = cmcSnap.absoluteChange24h;
          relativeChange24h = cmcSnap.relativeChange24h;
        } else {
          const firstV = btcProxy[0].value;
          const lastV = btcProxy[btcProxy.length - 1].value;
          absoluteChange24h = lastV - firstV;
          relativeChange24h = firstV > 0 ? (absoluteChange24h / firstV) * 100 : 0;
        }
      }
    }
  }

  if (points.length === 0) {
    if (useFallbackConstituents) {
      const cmc = await tryCmcSyntheticMarketTrend({ from, to, limit, maxCoins });
      if (cmc) {
        points = cmc.points;
        latestValue = cmc.latestValue;
        absoluteChange24h = cmc.absoluteChange24h;
        relativeChange24h = cmc.relativeChange24h;
      }
    } else if (
      Number.isFinite(previousValueForSynth) &&
      Number.isFinite(latestValue) &&
      previousValueForSynth > 0 &&
      latestValue > 0
    ) {
      points = buildLinearSyntheticPoints({
        from,
        to,
        limit,
        startValue: previousValueForSynth,
        endValue: latestValue,
      });
    }
  }

  return {
    points,
    latestValue,
    absoluteChange24h,
    relativeChange24h,
    range: {
      interval,
      from,
      to,
      limit,
    },
    constituents: constituents.length,
  };
}

async function aggregateKlinesFromTradesImpl(params: {
  exchange: string;
  symbol: string;
  interval: KlineInterval;
  from: Date;
  to: Date;
  limit: number;
}) {
  return chartRepository.aggregateKlinesFromTrades(params);
}

export const chartService = {
  async getKlines(params: {
    symbol: string;
    interval: KlineInterval;
    from?: string;
    to?: string;
    exchange?: string;
    limit?: number;
  }) {
    const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
    const symbol = normalizeChartSymbol(params.symbol);
    const interval = params.interval;
    const limit = Math.min(params.limit ?? 1000, 2000);

    const now = new Date();
    let from: Date;
    let to: Date;

    if (params.from && params.to) {
      from = new Date(params.from);
      to = new Date(params.to);
    } else {
      const days =
        interval === '1m'
          ? 7
          : interval === '5m'
            ? 30
            : interval === '15m'
              ? 14
              : interval === '1h'
                ? 90
                : interval === '4h'
                  ? 180
                  : interval === '1d'
                    ? 365
                    : 730;
      to = now;
      from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    const cacheKey = buildChartKlinesKey({
      exchange,
      symbol: symbol.toUpperCase(),
      interval,
      limit,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    });

    const { data } = await withResponseCache({
      cacheKey,
      ttlSeconds: KL_TTL[interval] ?? 60,
      metricsKind: 'chart:kl',
      fetcher: async () => {
        let klines = await chartRepository.findKlines({
          exchange,
          symbol,
          interval,
          from,
          to,
          limit,
        });
        if (klines.length === 0) {
          klines = await aggregateKlinesFromTradesImpl({
            exchange,
            symbol,
            interval,
            from,
            to,
            limit,
          });
        }
        if (klines.length === 0 && exchange === 'binance') {
          const pair = toBinancePair(symbol);
          if (pair) {
            klines =
              (await fetchBinanceKlinesRest({
                pair,
                interval,
                from,
                to,
                limit,
              })) ?? [];
          }
        }
        return klines;
      },
    });
    return data;
  },

  async aggregateKlinesFromTrades(params: {
    exchange: string;
    symbol: string;
    interval: KlineInterval;
    from: Date;
    to: Date;
    limit: number;
  }) {
    return aggregateKlinesFromTradesImpl(params);
  },

  async getTrades(params: {
    symbol: string;
    from?: string;
    to?: string;
    exchange?: string;
    limit?: number;
    dataType?: 'trade' | 'aggTrade';
  }) {
    const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
    const symbol = normalizeChartSymbol(params.symbol);
    const limit = Math.min(params.limit ?? 1000, 2000);
    const dataType = params.dataType || 'aggTrade';

    const now = new Date();
    const to = params.to ? new Date(params.to) : now;
    const from = params.from ? new Date(params.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const cacheKey = `chart:trades:v1:${exchange}:${symbol}:${dataType}:${limit}:${from.toISOString()}:${to.toISOString()}`;
    const { data } = await withResponseCache({
      cacheKey,
      ttlSeconds: 15,
      metricsKind: 'chart:trades',
      fetcher: () => chartRepository.findTrades({
        exchange,
        symbol,
        from,
        to,
        limit,
        dataType,
      }),
    });
    return data;
  },

  async getMarketTrend(params: {
    interval?: KlineInterval;
    from?: string;
    to?: string;
    exchange?: string;
    limit?: number;
    maxCoins?: number;
  }) {
    const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
    const interval = params.interval || '1m';
    const limit = Math.min(Math.max(params.limit ?? 240, 30), 720);
    const maxCoins = Math.min(Math.max(params.maxCoins ?? 25, 5), 100);

    const now = new Date();
    const bucketMs = INTERVAL_MS[interval];
    const to = params.to ? new Date(params.to) : now;
    const from = params.from
      ? new Date(params.from)
      : new Date(to.getTime() - bucketMs * (limit + Math.ceil(limit * 0.5)));

    const cacheKey = buildChartMarketTrendKey({
      exchange,
      interval,
      limit,
      maxCoins,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    });

    const { data } = await withResponseCache({
      cacheKey,
      ttlSeconds: MARKET_TREND_CACHE_TTL,
      metricsKind: 'chart:mt',
      fetcher: () =>
        buildMarketTrendPayload({
          ...params,
          useBatchedKlines: false,
        }),
    });
    return data;
  },

  /** Shadow / rollout path: batched Mongo reads (single aggregation per request). */
  async getMarketTrendV2(params: {
    interval?: KlineInterval;
    from?: string;
    to?: string;
    exchange?: string;
    limit?: number;
    maxCoins?: number;
  }) {
    if (!config.marketTrendV2Enabled) {
      return this.getMarketTrend(params);
    }

    const exchange = params.exchange || streamConfig.exchanges[0] || 'binance';
    const interval = params.interval || '1m';
    const limit = Math.min(Math.max(params.limit ?? 240, 30), 720);
    const maxCoins = Math.min(Math.max(params.maxCoins ?? 25, 5), 100);

    const now = new Date();
    const bucketMs = INTERVAL_MS[interval];
    const to = params.to ? new Date(params.to) : now;
    const from = params.from
      ? new Date(params.from)
      : new Date(to.getTime() - bucketMs * (limit + Math.ceil(limit * 0.5)));

    const cacheKey = buildChartMarketTrendV2Key({
      exchange,
      interval,
      limit,
      maxCoins,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    });

    const { data } = await withResponseCache({
      cacheKey,
      ttlSeconds: MARKET_TREND_CACHE_TTL,
      metricsKind: 'chart:mtv2',
      fetcher: () =>
        buildMarketTrendPayload({
          ...params,
          useBatchedKlines: true,
        }),
    });
    return data;
  },
};
