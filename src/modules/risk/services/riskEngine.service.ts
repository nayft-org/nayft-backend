import { computeNewsFactor } from './newsFactor.service';
import type { NewsFactorResult } from '../types';
import { riskReadService } from './riskRead.service';

/**
 * RRS entry point — batch CRS via riskReadService; NEWS factor for incremental use.
 */
export const riskEngine = {
  getNewsFactor: computeNewsFactor,

  getNewsFactorsForSymbols: async (symbols: string[]): Promise<Map<string, NewsFactorResult>> => {
    const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
    const results = await Promise.all(unique.map((symbol) => computeNewsFactor(symbol)));
    return new Map(results.map((r) => [r.symbol, r]));
  },

  getCoinRisk: async (symbol: string) => {
    const { meta, data } = await riskReadService.getCoin(symbol);
    return { meta, data };
  },

  getSnapshot: () => riskReadService.getSnapshot(),
};
