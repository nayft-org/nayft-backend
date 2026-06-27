import { randomUUID } from 'crypto';
import type { AiAnalystContextContract } from '../contracts/aiAnalystContextContract';
import { portfolioIntelligenceFacade } from '../services/portfolioIntelligenceFacade.service';

export type AiGovernanceDecision = {
  allowed: boolean;
  reason?: string;
  disclaimerPrefix?: string;
};

export const aiAnalystGovernanceService = {
  async handleChatTurn(params: { userId: string; message: string; sessionId?: string }) {
    const ctx = await portfolioIntelligenceFacade.getAiAnalystContext(params.userId);
    const decision = this.evaluateRequest(ctx);
    if (!decision.allowed) {
      return {
        sessionId: params.sessionId ?? randomUUID().slice(0, 16),
        blocked: true,
        reason: decision.reason,
      };
    }

    const prefix = decision.disclaimerPrefix ?? '';
    const disclaimers = ctx?.disclaimers?.join(' ') ?? 'This is not financial advice.';
    const response = this.sanitizeOutput(
      `${prefix}${disclaimers} Based on your portfolio: ` +
        `health ${ctx?.summary.healthLabel ?? 'unknown'}, ` +
        `identity ${ctx?.summary.identity.name ?? 'unknown'}, ` +
        `top category ${ctx?.summary.topCategory.name ?? 'unknown'} (${ctx?.summary.topCategory.pct ?? 0}%). ` +
        `Your question: "${params.message.slice(0, 200)}" — ` +
        `refer to insights and explainability in the Intelligence screen for details.`
    );

    return {
      sessionId: params.sessionId ?? randomUUID().slice(0, 16),
      blocked: false,
      response,
      citations: (ctx?.insights ?? []).slice(0, 3).map((i) => ({
        sourceType: 'insight' as const,
        sourceId: i.id,
        templateId: i.templateId,
      })),
      portfolioConfidence: ctx ? ctx.portfolioConfidence / 1000 : 0,
      governanceVersion: 'ai_governance_v1',
    };
  },
  evaluateRequest(context: AiAnalystContextContract | null): AiGovernanceDecision {
    if (!context) {
      return { allowed: false, reason: 'No portfolio context available' };
    }
    if (context.partial) {
      return {
        allowed: true,
        disclaimerPrefix: 'Analytics are partial. ',
      };
    }
    if (context.portfolioConfidence < 500) {
      return {
        allowed: true,
        disclaimerPrefix: 'Low confidence portfolio data. ',
      };
    }
    return { allowed: true };
  },

  sanitizeOutput(text: string): string {
    return text
      .replace(/\b(buy|sell|must invest|guaranteed returns)\b/gi, '[redacted-advice]')
      .slice(0, 4000);
  },

  blockPrescriptiveLanguage(confidence: number): boolean {
    return confidence < 400;
  },
};
