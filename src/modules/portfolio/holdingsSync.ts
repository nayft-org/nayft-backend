import { config } from '../../config/env';
import { fetchAndAggregateHoldings } from '../../utils/holdingsAggregator';
import { mergeZerionAndExchangeHoldings } from '../../utils/holdingsMerge';
import { portfolioRepository } from './repository';
import { fetchCoindcxHoldingsForUser } from './exchangeHoldingsBuilder';
import { HoldingPositionFields } from './models/Holding';

const EXCHANGE_VISIBLE = new Set<string>(['active', 'rate_limited']);

/**
 * Merged wallet (Zerion) + exchange (CoinDCX spot) positions for a user.
 */
export async function buildMergedHoldingsForUser(userId: string): Promise<{
  totalValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
  positions: HoldingPositionFields[];
}> {
  const wallets = await portfolioRepository.findWalletsByUser(userId);
  const addresses = wallets.map((w) => w.address);

  const walletPart =
    addresses.length > 0
      ? await fetchAndAggregateHoldings(addresses)
      : {
          totalValue: 0,
          absoluteChange24h: 0,
          relativeChange24h: 0,
          positions: [] as Array<{
            name: string;
            symbol: string;
            quantity: number;
            value: number;
            chain: string;
          }>,
        };

  const exchangePart =
    config.exchangePortfolioEnabled ? await fetchCoindcxHoldingsForUser(userId) : [];

  return mergeZerionAndExchangeHoldings(walletPart, exchangePart);
}

/**
 * All addresses the client should `portfolio_subscribe` to for this user: wallets + `coindcx:{connectionId}`.
 */
export async function getHoldingsBroadcastAddressesForUser(userId: string): Promise<string[]> {
  const wallets = await portfolioRepository.findWalletsByUser(userId);
  const w = wallets.map((x) => x.address.toLowerCase());
  if (!config.exchangePortfolioEnabled) {
    return [...new Set(w)];
  }
  const conns = await portfolioRepository.findExchangeConnectionsByUser(userId);
  const e = conns
    .filter((c) => EXCHANGE_VISIBLE.has(c.status))
    .map((c) => `coindcx:${String(c._id)}`.toLowerCase());
  return [...new Set([...w, ...e])];
}

/**
 * Whether the user has at least one exchange row that can contribute to holdings fetches.
 */
export async function userHasPollableExchangeConnection(userId: string): Promise<boolean> {
  if (!config.exchangePortfolioEnabled) return false;
  const conns = await portfolioRepository.findExchangeConnectionsByUser(userId);
  return conns.some((c) => EXCHANGE_VISIBLE.has(c.status));
}
