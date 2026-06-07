export const VIOLATION_CODES = [
  'MIN_LENGTH',
  'MAX_LENGTH',
  'WHITESPACE',
  'COMMON_PASSWORD',
  'CONTAINS_EMAIL',
  'CONTAINS_USERNAME',
  'REPEATED_CHARS',
  'INSUFFICIENT_ENTROPY',
] as const;

export type ViolationCode = (typeof VIOLATION_CODES)[number];

export const VIOLATION_FEEDBACK_KEYS: Record<ViolationCode, string> = {
  MIN_LENGTH: 'auth.passwordStrength.errorMinLength',
  MAX_LENGTH: 'auth.passwordStrength.errorMaxLength',
  WHITESPACE: 'auth.passwordStrength.errorWhitespace',
  COMMON_PASSWORD: 'auth.passwordStrength.errorCommon',
  CONTAINS_EMAIL: 'auth.passwordStrength.errorContainsEmail',
  CONTAINS_USERNAME: 'auth.passwordStrength.errorContainsUsername',
  REPEATED_CHARS: 'auth.passwordStrength.errorRepeated',
  INSUFFICIENT_ENTROPY: 'auth.passwordStrength.errorWeak',
};
