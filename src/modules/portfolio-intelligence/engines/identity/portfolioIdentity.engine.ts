import { loadIdentityRulesV1 } from '../../config/piFormulaRegistry';
import type { PipelineState } from '../../contracts/piEngineContracts';

export function runPortfolioIdentity(params: {
  state: PipelineState;
  riskTenths: number;
  diversificationScore: number;
  concentrationLevel: string;
  narrativeBps: Record<string, number>;
}) {
  const rules = loadIdentityRulesV1();
  const matchedRules: Array<{ ruleId: string; priority: number; score: number; passed: boolean }> = [];
  const scores: Array<{ id: string; name: string; priority: number; score: number }> = [];

  for (const rule of rules.rules) {
    const r = rule as Record<string, unknown>;
    let passed = false;
    let score = 0;
    const id = String(r.id);
    const priority = Number(r.priority ?? 0);

    if (id === 'bitcoin_maxi' && (params.state.allocationBps.Bitcoin ?? 0) >= Number(r.minBtcBps)) {
      passed = true;
      score = (params.state.allocationBps.Bitcoin ?? 0) / 100;
    }
    if (id === 'ai_hunter' && (params.narrativeBps.AI ?? 0) >= Number(r.minAiNarrativeBps)) {
      passed = true;
      score = (params.narrativeBps.AI ?? 0) / 100;
    }
    if (id === 'yield_farmer' && (params.state.allocationBps.DeFi ?? 0) >= Number(r.minDeFiBps)) {
      passed = true;
      score = (params.state.allocationBps.DeFi ?? 0) / 100;
    }
    if (id === 'risk_taker' && params.riskTenths >= Number(r.minRiskTenths)) {
      passed = true;
      score = params.riskTenths / 10;
    }
    if (
      id === 'capital_preserver' &&
      (params.state.allocationBps.Stablecoins ?? 0) >= Number(r.minStableBps) &&
      params.riskTenths <= Number(r.maxRiskTenths)
    ) {
      passed = true;
      score = 0.8;
    }
    if (id === 'balanced_investor' && params.diversificationScore >= Number(r.minDiversification)) {
      passed = true;
      score = params.diversificationScore / 100;
    }
    if (id === 'meme_degen' && (params.state.allocationBps.Memes ?? 0) >= Number(r.minMemeBps)) {
      passed = true;
      score = (params.state.allocationBps.Memes ?? 0) / 100;
    }

    matchedRules.push({ ruleId: id, priority, score, passed });
    if (passed) scores.push({ id, name: String(r.name), priority, score });
  }

  scores.sort((a, b) => b.priority - a.priority || b.score - a.score);
  const primary = scores[0] ?? { ...rules.default, confidence: 500 };
  const confidence = Math.min(1000, Math.round((scores[0]?.score ?? 0.5) * 1000));
  const secondary = scores[1];

  const signals: Record<string, number> = {
    riskTenths: params.riskTenths,
    diversification: params.diversificationScore,
    btcBps: params.state.allocationBps.Bitcoin ?? 0,
    memeBps: params.state.allocationBps.Memes ?? 0,
  };

  return {
    primary: { id: primary.id, name: primary.name, confidence: confidence / 1000 },
    secondary: secondary ? { id: secondary.id, name: secondary.name, confidence: Math.round(secondary.score * 1000) / 1000 } : undefined,
    signals,
    explain: { matchedRules },
  };
}
