/** Auth-specific counters for password policy and signup acceptance. */

export const authMetrics = {
  passwordValidationFailedTotal: 0,
  passwordSignupAcceptedTotal: 0,
  weakPasswordAttemptTotal: 0,
  passwordViolationCounts: {} as Record<string, number>,
};

export function getAuthMetricsSnapshot(): Record<string, unknown> {
  return {
    passwordValidationFailedTotal: authMetrics.passwordValidationFailedTotal,
    passwordSignupAcceptedTotal: authMetrics.passwordSignupAcceptedTotal,
    weakPasswordAttemptTotal: authMetrics.weakPasswordAttemptTotal,
    passwordViolationCounts: { ...authMetrics.passwordViolationCounts },
  };
}
