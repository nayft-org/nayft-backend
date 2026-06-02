// eslint-disable-next-line @typescript-eslint/no-var-requires
const vaderSentiment = require('vader-sentiment') as {
  SentimentIntensityAnalyzer: {
    polarity_scores: (text: string) => { compound: number; pos: number; neg: number };
  };
};

import { sentimentConfig } from '../config/sentimentConfig';
import { getSourceTrust } from './sourceTrust.service';

export type SentimentLabel = 'bullish' | 'bearish' | 'neutral' | 'risk';

export type SentimentScoreResult = {
  score: number;
  magnitude: number;
  label: SentimentLabel;
  confidence: number;
  flags: string[];
};

const BULLISH_TERMS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\betf approval\b/i, weight: 0.35 },
  { pattern: /\binflow\b/i, weight: 0.2 },
  { pattern: /\bwhale accumulation\b/i, weight: 0.25 },
  { pattern: /\bburn\b/i, weight: 0.15 },
  { pattern: /\bpartnership\b/i, weight: 0.12 },
  { pattern: /\badoption\b/i, weight: 0.12 },
  { pattern: /\bbreakout\b/i, weight: 0.18 },
  { pattern: /\ball-time high\b|\bath\b/i, weight: 0.15 },
];

const BEARISH_TERMS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bexploit\b/i, weight: 0.35 },
  { pattern: /\bhack\b/i, weight: 0.35 },
  { pattern: /\brug pull\b/i, weight: 0.4 },
  { pattern: /\bliquidation\b/i, weight: 0.25 },
  { pattern: /\bsec lawsuit\b/i, weight: 0.3 },
  { pattern: /\bunlock\b/i, weight: 0.2 },
  { pattern: /\bbankruptcy\b/i, weight: 0.35 },
  { pattern: /\bshort squeeze\b/i, weight: 0.1 },
];



function applyLexicon(text: string, base: number): { score: number; flags: string[] } {
  let delta = 0;
  const flags: string[] = [];
  for (const { pattern, weight } of BULLISH_TERMS) {
    if (pattern.test(text)) {
      delta += weight;
      flags.push('lexicon_bullish');
    }
  }
  for (const { pattern, weight } of BEARISH_TERMS) {
    if (pattern.test(text)) {
      delta -= weight;
      flags.push('lexicon_bearish');
    }
  }
  const score = Math.max(-1, Math.min(1, base + delta));
  return { score, flags: [...new Set(flags)] };
}

function toLabel(score: number, flags: string[]): SentimentLabel {
  if (flags.includes('lexicon_bearish') && score <= -0.15) return 'risk';
  if (score >= 0.2) return 'bullish';
  if (score <= -0.2) return 'bearish';
  if (score <= -0.35) return 'risk';
  return 'neutral';
}

export function scoreArticleText(params: {
  title: string;
  subtitle?: string;
  sourceKey?: string;
  sourceName?: string;
}): SentimentScoreResult {
  const text = `${params.title}\n${params.subtitle || ''}`.trim();
  const v = vaderSentiment.SentimentIntensityAnalyzer.polarity_scores(text);
  const base = v.compound;
  const { score: lexScore, flags: lexFlags } = applyLexicon(text, base);
  const magnitude = Math.min(1, Math.abs(lexScore) + (v.pos + v.neg) * 0.25);
  const sourceTrust = getSourceTrust(params.sourceKey, params.sourceName);
  const confidence = Math.min(1, magnitude * 0.7 + sourceTrust * 0.3);
  const label = toLabel(lexScore, lexFlags);
  const flags = [...lexFlags];
  if (confidence < 0.35) flags.push('low_confidence');
  if (!text) flags.push('empty_text');

  return {
    score: lexScore,
    magnitude,
    label,
    confidence,
    flags,
  };
}

export function scoreToLegacySentiment(label: SentimentLabel): string {
  if (label === 'bullish') return 'positive';
  if (label === 'bearish' || label === 'risk') return 'negative';
  return 'neutral';
}

export function getModelMetadata() {
  return { model: sentimentConfig.modelId, modelVersion: sentimentConfig.modelVersion };
}
