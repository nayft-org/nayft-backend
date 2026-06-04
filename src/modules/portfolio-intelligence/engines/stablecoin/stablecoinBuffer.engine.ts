import { bpsToPct1 } from '../math/piMath';
import type { PipelineState } from '../../contracts/piEngineContracts';

const STABLE_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'BUSD', 'TUSD', 'USDP']);

export function runStablecoinBuffer(state: PipelineState, positions: { symbol: string }[]) {
  const stableBps = state.allocationBps.Stablecoins ?? 0;
  const symbolStable = positions.some((p) => STABLE_SYMBOLS.has(p.symbol.toUpperCase()));
  const effectiveBps = stableBps > 0 || symbolStable ? Math.max(stableBps, symbolStable ? 100 : 0) : 0;
  const stablecoinPct = bpsToPct1(effectiveBps);

  let bufferClass = 'Thin';
  let pullbackReadiness = 'Low';
  if (stablecoinPct >= 15) {
    bufferClass = 'Strong';
    pullbackReadiness = 'High';
  } else if (stablecoinPct >= 5) {
    bufferClass = 'Adequate';
    pullbackReadiness = 'Medium';
  }

  return { stablecoinPct, bufferClass, pullbackReadiness, stableBps: effectiveBps };
}
