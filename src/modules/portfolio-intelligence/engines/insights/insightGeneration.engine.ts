import { createHash } from 'crypto';
import { loadInsightTemplatesV1 } from '../../config/piFormulaRegistry';
import type { PortfolioAnalyticsPayloadV2 } from '../../contracts/piEngineContracts';

function stableInsightId(templateId: string, evidence: Record<string, unknown>, taxonomyVersion: string): string {
  const keys = Object.keys(evidence).sort();
  const body = keys.map((k) => `${k}=${evidence[k]}`).join('|');
  return createHash('sha256').update(`${templateId}:${taxonomyVersion}:${body}`).digest('hex').slice(0, 16);
}

export function runInsightGeneration(
  snapshot: Pick<
    PortfolioAnalyticsPayloadV2,
    'allocation' | 'risk' | 'narrative' | 'concentration' | 'diversification' | 'stablecoin'
  >,
  taxonomyVersion: string,
  allocationBps: Record<string, number>,
  riskTenths: number
) {
  const cfg = loadInsightTemplatesV1();
  const raw: PortfolioAnalyticsPayloadV2['insights'] = [];

  for (const t of cfg.templates) {
    const tpl = t as Record<string, unknown>;
    const templateId = String(tpl.id);
    let fire = false;
    const evidence: Record<string, unknown> = { templateId, formulaVersion: cfg.version };

    if (templateId === 'high_meme_exposure' && (allocationBps.Memes ?? 0) >= Number(tpl.minBps)) {
      fire = true;
      evidence.actualBps = allocationBps.Memes;
      evidence.threshold = tpl.minBps;
    }
    if (templateId === 'extreme_btc_concentration' && (allocationBps.Bitcoin ?? 0) >= Number(tpl.minBps)) {
      fire = true;
      evidence.actualBps = allocationBps.Bitcoin;
    }
    if (templateId === 'low_stablecoin_buffer' && (allocationBps.Stablecoins ?? 0) <= Number(tpl.maxBps)) {
      fire = true;
      evidence.actualBps = allocationBps.Stablecoins;
    }
    if (templateId === 'high_ai_conviction' && (snapshot.narrative.vector.AI ?? 0) >= 30) {
      fire = true;
      evidence.actualPct = snapshot.narrative.vector.AI;
      evidence.threshold = 30;
    }
    if (templateId === 'weak_diversification' && snapshot.diversification.score <= Number(tpl.maxScore)) {
      fire = true;
      evidence.score = snapshot.diversification.score;
    }
    if (templateId === 'extreme_risk_score' && riskTenths >= Number(tpl.minRiskTenths)) {
      fire = true;
      evidence.riskTenths = riskTenths;
    }
    if (templateId === 'whale_concentration' && snapshot.concentration.topHoldingPct >= Number(tpl.minTopHoldingPct)) {
      fire = true;
      evidence.topHoldingPct = snapshot.concentration.topHoldingPct;
    }
    if (templateId === 'single_asset_dominance' && snapshot.concentration.topHoldingPct >= Number(tpl.minTopHoldingPct)) {
      fire = true;
      evidence.topHoldingPct = snapshot.concentration.topHoldingPct;
    }

    if (!fire) continue;

    const severity = String(tpl.severity);
    const sw = cfg.severityWeight[severity] ?? 1;
    const exposure = Number(evidence.actualBps ?? evidence.actualPct ?? evidence.topHoldingPct ?? 0);
    const priority = Math.round(sw * Math.log(1 + exposure) * 100);

    raw.push({
      id: stableInsightId(templateId, evidence, taxonomyVersion),
      templateId,
      type: String(tpl.type),
      severity,
      priority,
      title: String(tpl.title),
      summary: String(tpl.summary),
      evidence,
      confidence: 0.9,
      modelVersion: 'rules_v1',
    });
  }

  const byType = new Map<string, (typeof raw)[0]>();
  for (const ins of raw.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (!byType.has(ins.type)) byType.set(ins.type, ins);
  }

  return [...byType.values()]
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, cfg.maxInsights);
}
