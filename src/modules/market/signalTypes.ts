/**
 * Heuristic “signals” for Market Analysis tab (no external AI).
 */

export type SignalType = 'momentum' | 'breakout' | 'volatile';

export type SignalSeverity = 'positive' | 'warning';

export interface CoinSignal {
  type: SignalType;
  label: string;
  severity: SignalSeverity;
}

export const SIGNAL_CONFIG = {
  /** Absolute 24h % change threshold for momentum */
  momentum: { minChange24h: 7 },
  /** Coin is within this % distance of ATH (ath_change_percentage >= -X) */
  breakout: { athProximityPct: 15 },
  /** Intraday (high-low)/low range % for volatility flag */
  volatile: { minRangePct: 12 },
} as const;
