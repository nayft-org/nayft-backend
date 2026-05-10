import type { CoinSignal } from './signalTypes';
import { SIGNAL_CONFIG } from './signalTypes';

export interface SignalInput {
  price_change_percentage_24h?: number | null;
  ath_change_percentage?: number | null;
  high_24h?: number | null;
  low_24h?: number | null;
}

/**
 * Derives 0–3 signals from labeled market fields.
 * Order: momentum, breakout, volatile.
 */
export function computeSignals(coin: SignalInput): CoinSignal[] {
  const out: CoinSignal[] = [];

  const pct24 = coin.price_change_percentage_24h;
  if (typeof pct24 === 'number' && Number.isFinite(pct24)) {
    const abs = Math.abs(pct24);
    if (abs >= SIGNAL_CONFIG.momentum.minChange24h) {
      const up = pct24 > 0;
      out.push({
        type: 'momentum',
        label: 'Momentum',
        severity: up ? 'positive' : 'warning',
      });
    }
  }

  const athCh = coin.ath_change_percentage;
  if (typeof athCh === 'number' && Number.isFinite(athCh)) {
    if (athCh >= -SIGNAL_CONFIG.breakout.athProximityPct) {
      out.push({
        type: 'breakout',
        label: 'Breakout',
        severity: 'positive',
      });
    }
  }

  const hi = coin.high_24h;
  const lo = coin.low_24h;
  if (
    typeof hi === 'number' &&
    typeof lo === 'number' &&
    Number.isFinite(hi) &&
    Number.isFinite(lo) &&
    lo > 0
  ) {
    const rangePct = ((hi - lo) / lo) * 100;
    if (rangePct >= SIGNAL_CONFIG.volatile.minRangePct) {
      out.push({
        type: 'volatile',
        label: 'Risk: Volatile',
        severity: 'warning',
      });
    }
  }

  return out;
}
