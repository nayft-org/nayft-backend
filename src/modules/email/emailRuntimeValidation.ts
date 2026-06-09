import { config } from '../../config/env';
import { emailLogger } from './email.logger';

function isStrictProduction(): boolean {
  return config.nodeEnv === 'production' || (process.env.EMAIL_STRICT_PROVIDER_VALIDATION || '').toLowerCase() === 'true';
}

export function validateEmailRuntimeConfig(): { ok: boolean; reason?: string } {
  const provider = config.emailProvider;
  if (provider === 'mailtrap') {
    if (!config.mailtrapApiToken) {
      return { ok: false, reason: 'MAILTRAP_API_TOKEN is required when EMAIL_PROVIDER=mailtrap' };
    }
    if (!config.mailtrapSenderEmail) {
      return { ok: false, reason: 'MAILTRAP_SENDER_EMAIL is required when EMAIL_PROVIDER=mailtrap' };
    }
  }
  if (isStrictProduction() && (provider === 'noop' || provider === 'smtp')) {
    return { ok: false, reason: `EMAIL_PROVIDER=${provider} is not allowed in strict mode` };
  }
  return { ok: true };
}

export function assertEmailRuntimeConfigOrThrow(): void {
  const result = validateEmailRuntimeConfig();
  if (!result.ok) {
    const reason = result.reason || 'Invalid email runtime config';
    emailLogger.error('email_runtime_config_invalid', { reason, provider: config.emailProvider, nodeEnv: config.nodeEnv });
    throw new Error(reason);
  }
  emailLogger.info('email_runtime_config_valid', { provider: config.emailProvider, nodeEnv: config.nodeEnv });
}

