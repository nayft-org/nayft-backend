import { zerionApi, ZerionPosition } from './zerion';

export interface AggregatedHoldings {
  totalValue:        number;
  absoluteChange24h: number;
  relativeChange24h: number;
  positions:         Array<{ name: string; symbol: string; quantity: number; value: number; chain: string }>;
}

function mergePositions(
  positions: ZerionPosition[]
): Array<{ name: string; symbol: string; quantity: number; value: number; chain: string }> {
  const byKey = new Map<string, { name: string; symbol: string; quantity: number; value: number; chain: string }>();
  for (const p of positions) {
    const key = `${p.symbol}:${p.chain}`.toLowerCase();
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

/**
 * Fetches portfolio and positions from Zerion for each address, then aggregates.
 * Catches Zerion errors per-address and continues with others; returns partial data.
 */
export async function fetchAndAggregateHoldings(
  addresses: string[]
): Promise<AggregatedHoldings> {
  console.log('[Holdings] fetchAndAggregateHoldings: entry', { addressCount: addresses.length });
  let totalValue = 0;
  let absoluteChange24h = 0;
  let relativeChange24h = 0;
  const allPositions: ZerionPosition[] = [];

  let weightedRelativeSum = 0;

  for (const address of addresses) {
    try {
      console.log('[Holdings] fetchAndAggregateHoldings: fetching Zerion for', address.slice(0, 10) + '...');
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

      // Delay to reduce 429 on positions (demo tier rate limit)
      await new Promise((r) => setTimeout(r, 2000));

      try {
        positions = await zerionApi.getWalletPositions(address);
      } catch (err) {
        console.warn('[Holdings] fetchAndAggregateHoldings: positions failed (rate limit?), using portfolio total', address.slice(0, 10) + '...');
        positions = [];
      }

      const effectiveTotal =
        positions.length > 0
          ? positions.reduce((s, p) => s + (p.value ?? 0), 0)
          : portfolioTotal;
      console.log('[Holdings] fetchAndAggregateHoldings: Zerion response', { address: address.slice(0, 10) + '...', portfolioTotal, positionsCount: positions.length, effectiveTotal });

      totalValue += effectiveTotal;
      absoluteChange24h += port.absoluteChange24h;
      weightedRelativeSum += effectiveTotal * (port.relativeChange24h ?? 0);
      allPositions.push(...positions);
    } catch (err) {
      console.error('[Holdings] fetchAndAggregateHoldings: Zerion fetch failed for', address.slice(0, 10) + '...', err);
    }
  }

  relativeChange24h = totalValue > 0 ? weightedRelativeSum / totalValue : 0;
  const positions = mergePositions(allPositions);

  console.log('[Holdings] fetchAndAggregateHoldings: done', { totalValue, positionsCount: positions.length });

  return {
    totalValue,
    absoluteChange24h,
    relativeChange24h,
    positions,
  };
}
