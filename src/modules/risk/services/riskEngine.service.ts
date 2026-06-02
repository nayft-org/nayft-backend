import { computeNewsFactor } from './newsFactor.service';
import type { NewsFactorResult } from '../types';

/**
 * RRS entry point — v1 exposes NEWS factor only; other factors added when RRS ships.
 */
export const riskEngine = {
  getNewsFactor: computeNewsFactor,

  /**
   * Batch NEWS factors for universe scoring (e.g. percentile pass).
   */
  getNewsFactorsForSymbols: async (symbols: string[]): Promise<Map<string, NewsFactorResult>> => {
    const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
    const results = await Promise.all(unique.map((symbol) => computeNewsFactor(symbol)));
    return new Map(results.map((r) => [r.symbol, r]));
  },
};
