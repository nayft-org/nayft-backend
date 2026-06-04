import { roundHalfUp } from '../math/piMath';
import type { PipelineState } from '../../contracts/piEngineContracts';

export function runDiversification(state: PipelineState) {
  const bps = state.allocationBps;
  const active = Object.entries(bps).filter(([, v]) => v >= 500);
  const effectiveCategories = active.length;

  const probs = Object.values(bps).filter((v) => v > 0).map((v) => v / 10000);
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = probs.length > 1 ? Math.log2(probs.length) : 1;
  let score = maxEntropy > 0 ? roundHalfUp((100 * entropy) / maxEntropy) : 0;

  const maxBps = Math.max(0, ...Object.values(bps));
  if (maxBps > 7000) score = roundHalfUp(score * 0.6);

  let label = 'Excellent';
  if (score < 35) label = 'Poor';
  else if (score < 55) label = 'Fair';
  else if (score < 75) label = 'Good';

  return { score, label, effectiveCategories };
}
