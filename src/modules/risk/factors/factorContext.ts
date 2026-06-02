import type { IRrsUniverseMember } from '../models/RrsBuildUniverse';
import type { FrozenUniverse } from '../universe/rrsUniverse.service';

export type MarketRow = {
  symbol: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  fully_diluted_valuation?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
  high_24h?: number;
  low_24h?: number;
  last_updated?: string;
};

export type OhlcRow = {
  closes: number[];
  volumes: number[];
  highs: number[];
  lows: number[];
  lastOpenTime: Date;
};

export type FactorBuildContext = {
  universe: FrozenUniverse;
  marketBySymbol: Map<string, MarketRow>;
  ohlcBySymbol: Map<string, OhlcRow>;
  buildCutoffTime: Date;
};

export function getMember(ctx: FactorBuildContext, symbol: string): IRrsUniverseMember | undefined {
  return ctx.universe.members.find((m) => m.symbol === symbol);
}
