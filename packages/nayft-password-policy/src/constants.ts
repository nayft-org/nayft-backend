export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_ZXCVBN_SCORE = 3;
export const PASSWORD_RECOMMENDED_LENGTH = 14;

export const STRENGTH_COLORS = {
  poor: { light: '#ef4444', dark: '#f87171' },
  low: { light: '#f59e0b', dark: '#fbbf24' },
  strong: { light: '#22c55e', dark: '#4ade80' },
} as const;
