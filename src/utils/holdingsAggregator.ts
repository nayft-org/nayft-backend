import { zerionApi, ZerionPosition } from './zerion';
import { piConfig } from '../modules/portfolio-intelligence/config/piConfig';

export type TaggedWalletPosition = {
  name: string;
  symbol: string;
  quantity: number;
  value: number;
  chain: string;
  source: 'wallet';
  sourceConnectionId?: string;
};

export interface AggregatedHoldings {
  totalValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
  positions: TaggedWalletPosition[];
}

export type WalletHoldingsInput = {
  id: string;
  address: string;
};

function mergePositionsWithinWallet(positions: TaggedWalletPosition[]): TaggedWalletPosition[] {
  const byKey = new Map<string, TaggedWalletPosition>();
  for (const p of positions) {
    const walletKey = p.sourceConnectionId ?? 'unknown';
    const key = `${walletKey}:${p.symbol}:${p.chain}`.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += p.quantity;
      existing.value += p.value;
    } else {
      byKey.set(key, { ...p });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.value - a.value);
}

function normalizeWalletInputs(wallets: WalletHoldingsInput[] | string[]): WalletHoldingsInput[] {
  if (wallets.length === 0) return [];
  if (typeof wallets[0] === 'string') {
    return (wallets as string[]).map((address) => ({ id: address, address }));
  }
  return wallets as WalletHoldingsInput[];
}

/**
 * Fetches portfolio and positions from Zerion for each wallet, then aggregates totals.
 * Positions are merged only within the same wallet (preserves per-wallet rows for client filtering).
 */
export async function fetchAndAggregateHoldings(
  wallets: WalletHoldingsInput[] | string[]
): Promise<AggregatedHoldings> {
  const walletInputs = normalizeWalletInputs(wallets);
  let totalValue = 0;
  let absoluteChange24h = 0;
  let weightedRelativeSum = 0;
  const allPositions: TaggedWalletPosition[] = [];

  for (const { id: walletId, address } of walletInputs) {
    try {
      let portfolioTotal = 0;
      let port: Awaited<ReturnType<typeof zerionApi.getWalletPortfolio>>;
      let positions: ZerionPosition[] = [];

      try {
        port = await zerionApi.getWalletPortfolio(address);
        portfolioTotal = port.totalValue;
      } catch (err) {
        console.error('[Holdings] fetchAndAggregateHoldings: portfolio failed for', address.slice(0, 10) + '...', err);
        continue;
      }

      if (!piConfig.apiZerionSleepDisabled) {
        await new Promise((r) => setTimeout(r, 2000));
      }

      try {
        positions = await zerionApi.getWalletPositions(address);
      } catch (err) {
        console.warn(
          '[Holdings] fetchAndAggregateHoldings: positions failed (rate limit?), using portfolio total',
          address.slice(0, 10) + '...'
        );
        positions = [];
      }

      const effectiveTotal =
        positions.length > 0
          ? positions.reduce((s, p) => s + (p.value ?? 0), 0)
          : portfolioTotal;

      totalValue += effectiveTotal;
      absoluteChange24h += port.absoluteChange24h;
      weightedRelativeSum += effectiveTotal * (port.relativeChange24h ?? 0);

      const tagged: TaggedWalletPosition[] = positions.map((p) => ({
        name: p.name,
        symbol: p.symbol,
        quantity: p.quantity,
        value: p.value,
        chain: p.chain,
        source: 'wallet',
        sourceConnectionId: walletId,
      }));

      allPositions.push(...mergePositionsWithinWallet(tagged));
    } catch (err) {
      console.error('[Holdings] fetchAndAggregateHoldings: Zerion fetch failed for', address.slice(0, 10) + '...', err);
    }
  }

  const relativeChange24h = totalValue > 0 ? weightedRelativeSum / totalValue : 0;

  return {
    totalValue,
    absoluteChange24h,
    relativeChange24h,
    positions: allPositions.sort((a, b) => b.value - a.value),
  };
}
