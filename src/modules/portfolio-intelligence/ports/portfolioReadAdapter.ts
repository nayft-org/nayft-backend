import { portfolioRepository } from '../../portfolio/repository';
import { userHasPollableExchangeConnection } from '../../portfolio/holdingsSync';
import type { IPortfolioReadPort } from './portfolioReadPort';

export const portfolioReadAdapter: IPortfolioReadPort = {
  findWalletsByUser: (userId) => portfolioRepository.findWalletsByUser(userId),
  findHoldingsByUser: async (userId) => {
    const h = await portfolioRepository.findHoldingsByUser(userId);
    if (!h) return null;
    return {
      totalValue: h.totalValue,
      absoluteChange24h: h.absoluteChange24h,
      relativeChange24h: h.relativeChange24h,
      positions: h.positions ?? [],
      syncedAt: h.syncedAt,
    };
  },
  userHasPollableExchangeConnection,
  findExchangeConnectionsByUser: (userId) => portfolioRepository.findExchangeConnectionsByUser(userId),
  upsertHoldings: (userId, data) =>
    portfolioRepository.upsertHoldings(userId, {
      totalValue: data.totalValue,
      absoluteChange24h: data.absoluteChange24h,
      relativeChange24h: data.relativeChange24h,
      positions: data.positions,
      ingestRevision: data.ingestRevision,
    }),
};
