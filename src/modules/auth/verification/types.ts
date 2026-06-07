export type VerificationPurpose = 'email_signup' | 'email_change' | 'password_reset' | 'mfa_setup';

export type VerificationOutcome = 'pending' | 'consumed' | 'expired' | 'superseded' | 'locked';

export type VerificationFailReason = 'invalid' | 'expired' | 'locked';

export type EmailDeliveryStatus = 'queued' | 'sent' | 'failed' | 'skipped';
