import type { AggregatedHoldings } from './holdingsAggregator';
import type { HoldingPositionFields } from '../modules/portfolio/models/Holding';

/**
 * Combine Zerion-aggregated wallet rows with pre-built exchange (CoinDCX) rows.
 * Exchange leg does not contribute 24h move (see plan); wallet 24h stats are preserved and scaled in relativeChange when totals mix.
 */
export function mergeZerionAndExchangeHoldings(
  wallet: AggregatedHoldings,
  exchange: HoldingPositionFields[]
): {
  totalValue: number;
  absoluteChange24h: number;
  relativeChange24h: number;
  positions: HoldingPositionFields[];
} {
  const wPositions: HoldingPositionFields[] = wallet.positions.map((p) => ({
    name:     p.name,
    symbol:   p.symbol,
    quantity: p.quantity,
    value:    p.value,
    chain:    p.chain,
    source:   'wallet' as const,
  }));

  const wTotal   = wallet.totalValue;
  const wAbs     = wallet.absoluteChange24h;
  const wRel     = wallet.relativeChange24h;
  const exTotal  = exchange.reduce((s, p) => s + (p.value ?? 0), 0);
  const newTotal = wTotal + exTotal;

  const absoluteChange24h = wAbs;
  const relativeChange24h =
    newTotal > 0 ? (wTotal * wRel) / newTotal : 0;

  return {
    totalValue: newTotal,
    absoluteChange24h,
    relativeChange24h,
    positions: [...wPositions, ...exchange],
  };
}
