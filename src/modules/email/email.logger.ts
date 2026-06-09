type EmailLogLevel = 'info' | 'warn' | 'error';

type EmailLogContext = Record<string, unknown>;

function log(level: EmailLogLevel, message: string, context: EmailLogContext = {}): void {
  const payload = {
    scope: 'email-pipeline',
    level,
    message,
    ts: new Date().toISOString(),
    ...context,
  };
  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const left = local.length > 0 ? local[0] : '*';
  return `${left}***@${domain}`;
}

export const emailLogger = {
  info(message: string, context: EmailLogContext = {}): void {
    log('info', message, context);
  },
  warn(message: string, context: EmailLogContext = {}): void {
    log('warn', message, context);
  },
  error(message: string, context: EmailLogContext = {}): void {
    log('error', message, context);
  },
  maskEmail,
};

