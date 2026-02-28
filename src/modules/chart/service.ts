import { chartRepository } from './repository';
import type { KlineInterval } from './model';
import { streamConfig } from '../../config/streamConfig';

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
    const symbol = params.symbol.trim().toUpperCase();
    const interval = params.interval;
    const limit = Math.min(params.limit ?? 1000, 2000);

    const now = new Date();
    let from: Date;
    let to: Date;

    if (params.from && params.to) {
      from = new Date(params.from);
      to = new Date(params.to);
    } else {
      const days = interval === '1m' ? 7 : interval === '5m' ? 30 : interval === '1h' ? 90 : 365;
      to = now;
      from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    return chartRepository.findKlines({
      exchange,
      symbol,
      interval,
      from,
      to,
      limit,
    });
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
    const symbol = params.symbol.trim().toUpperCase();
    const limit = Math.min(params.limit ?? 1000, 2000);
    const dataType = params.dataType || 'aggTrade';

    const now = new Date();
    const to = params.to ? new Date(params.to) : now;
    const from = params.from ? new Date(params.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return chartRepository.findTrades({
      exchange,
      symbol,
      from,
      to,
      limit,
      dataType,
    });
  },
};
