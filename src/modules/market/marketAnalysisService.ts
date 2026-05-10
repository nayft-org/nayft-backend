import pLimit from 'p-limit';
import { config } from '../../config/env';
import { cacheHelpers } from '../../config/redis';
import { LabeledActiveCoin } from '../coin/models/LabeledActiveCoin';
import { computeSignals } from './signalComputer';
import type { CoinSignal } from './signalTypes';
import { newsService } from '../news/service';

const CACHE_KEY = 'market:analysis';
const CACHE_TTL_SEC = 120;
const SCAN_LIMIT = 400;
const RESULT_CAP = 60;
const NEWS_CONCURRENCY = 8;

export interface MarketAnalysisCoinDto {
  coinId: string;
  internalCoinId?: string;
  symbol: string;
  name: string;
  image?: string;
  price: number;
  percentChange24h: number;
  rank?: number;
  signals: CoinSignal[];
  whyMoving?: string;
}

export interface MarketAnalysisPayload {
  coins: MarketAnalysisCoinDto[];
  generatedAt: string;
}

function scoreRow(
  signals: CoinSignal[],
  pct24: number | undefined,
  high: number | undefined,
  low: number | undefined
): number {
  let range = 0;
  if (typeof high === 'number' && typeof low === 'number' && low > 0) {
    range = ((high - low) / low) * 100;
  }
  const mag = typeof pct24 === 'number' && Number.isFinite(pct24) ? Math.abs(pct24) : 0;
  return signals.length * 1_000_000 + mag * 1_000 + range;
}

async function attachWhyMoving(symbols: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const limit = pLimit(NEWS_CONCURRENCY);
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];

  await Promise.all(
    unique.map((sym) =>
      limit(async () => {
        try {
          const news = await newsService.getNewsByCoinSymbol(sym, 1);
          const title = news[0]?.title?.trim();
          if (title) map.set(sym, title);
        } catch {
          /* ignore per-symbol news failures */
        }
      })
    )
  );
  return map;
}

export const marketAnalysisService = {
  async getCoinsWithSignals(options?: { skipCache?: boolean }): Promise<MarketAnalysisPayload> {
    if (!options?.skipCache) {
      const cached = await cacheHelpers.get<MarketAnalysisPayload>(CACHE_KEY);
      if (cached?.coins && cached.generatedAt) return cached;
    }

    const filter = { provider: config.coinDataPrimarySnapshotProvider };
    const select =
      'id internalCoinId symbol name image current_price market_cap_rank price_change_percentage_24h high_24h low_24h ath_change_percentage';

    const docs = await LabeledActiveCoin.find(filter)
      .select(select)
      .sort({ market_cap_rank: 1 })
      .limit(SCAN_LIMIT)
      .lean()
      .exec();

    const rows: {
      dto: MarketAnalysisCoinDto;
      score: number;
    }[] = [];

    for (const d of docs as Array<{
      id?: string;
      internalCoinId?: string;
      symbol?: string;
      name?: string;
      image?: string;
      current_price?: number;
      market_cap_rank?: number;
      price_change_percentage_24h?: number;
      high_24h?: number;
      low_24h?: number;
      ath_change_percentage?: number;
    }>) {
      const id = d.id?.trim();
      if (!id) continue;
      const symbol = (d.symbol ?? '').trim();
      if (!symbol) continue;

      const signals = computeSignals({
        price_change_percentage_24h: d.price_change_percentage_24h,
        ath_change_percentage: d.ath_change_percentage,
        high_24h: d.high_24h,
        low_24h: d.low_24h,
      });

      if (signals.length === 0) continue;

      const price = typeof d.current_price === 'number' && Number.isFinite(d.current_price) ? d.current_price : 0;
      const pct =
        typeof d.price_change_percentage_24h === 'number' && Number.isFinite(d.price_change_percentage_24h)
          ? d.price_change_percentage_24h
          : 0;

      rows.push({
        dto: {
          coinId: id,
          internalCoinId: d.internalCoinId,
          symbol,
          name: d.name ?? symbol,
          image: d.image,
          price,
          percentChange24h: pct,
          rank: d.market_cap_rank,
          signals,
        },
        score: scoreRow(signals, d.price_change_percentage_24h, d.high_24h, d.low_24h),
      });
    }

    rows.sort((a, b) => b.score - a.score);
    const top = rows.slice(0, RESULT_CAP).map((r) => r.dto);

    const headlineBySymbol = await attachWhyMoving(top.map((c) => c.symbol));
    for (const c of top) {
      const h = headlineBySymbol.get(c.symbol.toUpperCase());
      if (h) c.whyMoving = h;
    }

    const generatedAt = new Date().toISOString();
    const payload: MarketAnalysisPayload = { coins: top, generatedAt };
    await cacheHelpers.set(CACHE_KEY, payload, CACHE_TTL_SEC);
    return payload;
  },
};
