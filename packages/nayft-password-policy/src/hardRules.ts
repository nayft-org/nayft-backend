import commonPasswords from './data/common-passwords-top10k.json';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RECOMMENDED_LENGTH,
} from './constants';
import type { ViolationCode } from './violations';

const COMMON_PASSWORD_SET = new Set(commonPasswords as string[]);
const REPEATED_CHARS_REGEX = /(.)\1{5,}/;

export type PasswordContext = {
  email?: string;
  username?: string;
};

export type ChecklistItem = {
  key: string;
  passed: boolean;
  labelKey: string;
  aspirational?: boolean;
};

export function checkHardRules(password: string, context: PasswordContext = {}): ViolationCode[] {
  const violations: ViolationCode[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    violations.push('MIN_LENGTH');
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    violations.push('MAX_LENGTH');
  }
  if (password !== password.trim()) {
    violations.push('WHITESPACE');
  }
  if (COMMON_PASSWORD_SET.has(password.toLowerCase())) {
    violations.push('COMMON_PASSWORD');
  }
  if (REPEATED_CHARS_REGEX.test(password)) {
    violations.push('REPEATED_CHARS');
  }

  const lowerPassword = password.toLowerCase();
  const email = context.email?.trim().toLowerCase();
  const username = context.username?.trim().toLowerCase();

  if (email) {
    const localPart = email.split('@')[0];
    if (lowerPassword === email || (localPart.length >= 3 && lowerPassword.includes(localPart))) {
      violations.push('CONTAINS_EMAIL');
    }
  }
  if (username && username.length >= 3) {
    if (lowerPassword === username || lowerPassword.includes(username)) {
      violations.push('CONTAINS_USERNAME');
    }
  }

  return violations;
}

export function hasMixedCharacterTypes(password: string): boolean {
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const types = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  return types >= 2;
}

export function buildChecklist(
  password: string,
  _context: PasswordContext,
  violations: ViolationCode[],
  level: 'poor' | 'low' | 'strong'
): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      key: 'min_length',
      passed: password.length >= PASSWORD_MIN_LENGTH,
      labelKey: 'auth.passwordStrength.checkMinLength',
    },
    {
      key: 'mixed_chars',
      passed: hasMixedCharacterTypes(password),
      labelKey: 'auth.passwordStrength.checkMixedChars',
    },
    {
      key: 'not_common',
      passed: !violations.includes('COMMON_PASSWORD'),
      labelKey: 'auth.passwordStrength.checkNotCommon',
    },
    {
      key: 'not_context',
      passed:
        !violations.includes('CONTAINS_EMAIL') && !violations.includes('CONTAINS_USERNAME'),
      labelKey: 'auth.passwordStrength.checkNotContext',
    },
  ];

  if (level === 'strong') {
    items.push({
      key: 'recommended_length',
      passed: password.length >= PASSWORD_RECOMMENDED_LENGTH,
      labelKey: 'auth.passwordStrength.checkRecommendedLength',
      aspirational: true,
    });
  }

  return items;
}
