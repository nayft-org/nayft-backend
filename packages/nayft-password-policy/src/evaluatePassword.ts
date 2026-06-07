import { z } from 'zod';
import { PASSWORD_MIN_ZXCVBN_SCORE } from './constants';
import { buildChecklist, checkHardRules, type PasswordContext } from './hardRules';
import { computeFillRatio, isAcceptableLevel, mapScoreToLevel, type StrengthLevel } from './levels';
import { scorePassword } from './zxcvbnSetup';
import { VIOLATION_FEEDBACK_KEYS, type ViolationCode } from './violations';

export type PasswordEvaluationResult = {
  valid: boolean;
  level: StrengthLevel;
  score: number;
  fillRatio: number;
  violations: ViolationCode[];
  feedbackKey: string;
  isAcceptable: boolean;
  checklist: ReturnType<typeof buildChecklist>;
};

export const passwordEvaluationResultSchema = z.object({
  valid: z.boolean(),
  level: z.enum(['poor', 'low', 'strong']),
  score: z.number().int().min(0).max(4),
  fillRatio: z.number().min(0).max(1),
  violations: z.array(z.string()),
  feedbackKey: z.string(),
  isAcceptable: z.boolean(),
});

export function evaluatePassword(
  password: string,
  context: PasswordContext = {}
): PasswordEvaluationResult {
  if (!password) {
    return {
      valid: false,
      level: 'poor',
      score: 0,
      fillRatio: 0,
      violations: ['MIN_LENGTH'],
      feedbackKey: VIOLATION_FEEDBACK_KEYS.MIN_LENGTH,
      isAcceptable: false,
      checklist: buildChecklist(password, context, ['MIN_LENGTH'], 'poor'),
    };
  }

  const hardViolations = checkHardRules(password, context);
  const userInputs = [context.email, context.username].filter((v): v is string => Boolean(v));
  const score = scorePassword(password, userInputs);
  const hasHardRuleViolation = hardViolations.length > 0;
  const level = mapScoreToLevel(score, hasHardRuleViolation);

  const violations = [...hardViolations];
  if (!hasHardRuleViolation && score < PASSWORD_MIN_ZXCVBN_SCORE) {
    violations.push('INSUFFICIENT_ENTROPY');
  }

  const isAcceptable = isAcceptableLevel(level, score, violations);
  const primaryViolation = violations[0];
  const feedbackKey = primaryViolation
    ? VIOLATION_FEEDBACK_KEYS[primaryViolation]
    : isAcceptable
      ? 'auth.passwordStrength.strong'
      : 'auth.passwordStrength.errorWeak';

  return {
    valid: isAcceptable,
    level,
    score,
    fillRatio: computeFillRatio(score, hasHardRuleViolation),
    violations,
    feedbackKey,
    isAcceptable,
    checklist: buildChecklist(password, context, violations, level),
  };
}
