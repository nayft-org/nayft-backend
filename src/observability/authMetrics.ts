/** Auth-specific counters for password policy and signup acceptance. */

export const authMetrics = {
  passwordValidationFailedTotal: 0,
  passwordSignupAcceptedTotal: 0,
  weakPasswordAttemptTotal: 0,
  passwordViolationCounts: {} as Record<string, number>,
  verificationSuccessTotal: 0,
  verificationFailedTotal: 0,
  verificationExpiredTotal: 0,
  verificationLockedTotal: 0,
  verificationResendTotal: 0,
  verificationResendSpamTotal: 0,
  emailSendSuccessTotal: 0,
  emailRetryTotal: 0,
  emailDeliveryExhaustedTotal: 0,
  emailQueueDepth: 0,
  emailDlqDepth: 0,
};

export function getAuthMetricsSnapshot(): Record<string, unknown> {
  return {
    passwordValidationFailedTotal: authMetrics.passwordValidationFailedTotal,
    passwordSignupAcceptedTotal: authMetrics.passwordSignupAcceptedTotal,
    weakPasswordAttemptTotal: authMetrics.weakPasswordAttemptTotal,
    passwordViolationCounts: { ...authMetrics.passwordViolationCounts },
    verificationSuccessTotal: authMetrics.verificationSuccessTotal,
    verificationFailedTotal: authMetrics.verificationFailedTotal,
    verificationExpiredTotal: authMetrics.verificationExpiredTotal,
    verificationLockedTotal: authMetrics.verificationLockedTotal,
    verificationResendTotal: authMetrics.verificationResendTotal,
    verificationResendSpamTotal: authMetrics.verificationResendSpamTotal,
    emailSendSuccessTotal: authMetrics.emailSendSuccessTotal,
    emailRetryTotal: authMetrics.emailRetryTotal,
    emailDeliveryExhaustedTotal: authMetrics.emailDeliveryExhaustedTotal,
    emailQueueDepth: authMetrics.emailQueueDepth,
    emailDlqDepth: authMetrics.emailDlqDepth,
  };
}
