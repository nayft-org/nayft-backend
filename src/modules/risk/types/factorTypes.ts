export type RiskFactorName = 'volatility' | 'liquidity' | 'drawdown' | 'fundamentals' | 'news';

export type FactorRawResult = {
  raw: number;
  confidence: number;
  flags: string[];
  factorSnapshotTime: Date;
  buildCutoffTime: Date;
  stalenessMs: number;
  invalid: boolean;
  inputsHash?: string;
};

export type NormalizedFactorResult = {
  normalized: number;
  rank: number;
  percentile: number;
  excluded: boolean;
  flags: string[];
};

export type CoinFactorBundle = {
  symbol: string;
  internalCoinId?: string;
  factors: Record<RiskFactorName, FactorRawResult>;
  normalized: Record<RiskFactorName, NormalizedFactorResult>;
};

export type CrsResult = {
  crs: number;
  crsRaw: number;
  rank: number;
  percentile: number;
  confidence: number;
  flags: string[];
};
