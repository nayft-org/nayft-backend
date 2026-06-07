import type { ViolationCode } from './violations';
import { PASSWORD_MIN_ZXCVBN_SCORE } from './constants';

export type StrengthLevel = 'poor' | 'low' | 'strong';

export function mapScoreToLevel(score: number, hasHardRuleViolation: boolean): StrengthLevel {
  if (hasHardRuleViolation || score <= 1) return 'poor';
  if (score === 2) return 'low';
  return 'strong';
}

export function computeFillRatio(score: number, hasHardRuleViolation: boolean): number {
  if (hasHardRuleViolation) return Math.min(0.33, (score + 1) / 5);
  return Math.max(0, Math.min(1, (score + 1) / 5));
}

export function isAcceptableLevel(level: StrengthLevel, score: number, violations: ViolationCode[]): boolean {
  return level === 'strong' && score >= PASSWORD_MIN_ZXCVBN_SCORE && violations.length === 0;
}
