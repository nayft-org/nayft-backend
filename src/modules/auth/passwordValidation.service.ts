import { evaluatePassword, type PasswordEvaluationResult } from '@nayft/password-policy';
import { passwordPolicyConfig } from './passwordPolicy.config';

export type PasswordValidationContext = {
  email?: string;
  username?: string;
};

const FEEDBACK_MESSAGES: Record<string, string> = {
  'auth.passwordStrength.errorMinLength': 'Password must be at least 12 characters.',
  'auth.passwordStrength.errorMaxLength': 'Password must be at most 128 characters.',
  'auth.passwordStrength.errorWhitespace': 'Password cannot have leading or trailing spaces.',
  'auth.passwordStrength.errorCommon': 'This password is too common. Please choose a different one.',
  'auth.passwordStrength.errorContainsEmail': 'Password cannot include your email.',
  'auth.passwordStrength.errorContainsUsername': 'Password cannot include your username.',
  'auth.passwordStrength.errorRepeated': 'Password has too many repeated characters.',
  'auth.passwordStrength.errorWeak':
    'Password is too weak. Choose a longer passphrase with mixed characters.',
  'auth.passwordStrength.strong': 'Password meets strength requirements.',
};

export function getPasswordFeedbackMessage(feedbackKey: string): string {
  return FEEDBACK_MESSAGES[feedbackKey] ?? FEEDBACK_MESSAGES['auth.passwordStrength.errorWeak'];
}

export function validatePassword(
  password: string,
  context: PasswordValidationContext = {}
): PasswordEvaluationResult {
  return evaluatePassword(password, context);
}

export function validatePasswordForSignup(
  password: string,
  context: PasswordValidationContext
): PasswordEvaluationResult {
  const result = validatePassword(password, context);
  if (!passwordPolicyConfig.blockCommon && result.violations.includes('COMMON_PASSWORD')) {
    const filtered = result.violations.filter((v) => v !== 'COMMON_PASSWORD');
    return {
      ...result,
      violations: filtered,
      valid: filtered.length === 0 && result.level === 'strong' && result.score >= passwordPolicyConfig.minZxcvbnScore,
      isAcceptable: filtered.length === 0 && result.level === 'strong' && result.score >= passwordPolicyConfig.minZxcvbnScore,
    };
  }
  return result;
}
