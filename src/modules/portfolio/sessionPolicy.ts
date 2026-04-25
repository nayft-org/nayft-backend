import { IncomingHttpHeaders } from 'http';

export type PortfolioSessionMode = 'bootstrap' | 'live' | 'degraded' | 'recovery';
export type PortfolioTriggerReason =
  | 'bootstrap'
  | 'ui_default'
  | 'manual_refresh'
  | 'reconnect_recovery'
  | 'stale_reconciliation';

export interface PortfolioRequestContext {
  mode: PortfolioSessionMode;
  triggerReason: PortfolioTriggerReason;
}

const DEFAULT_CONTEXT: PortfolioRequestContext = {
  mode: 'bootstrap',
  triggerReason: 'bootstrap',
};

const MODE_SET: Set<PortfolioSessionMode> = new Set(['bootstrap', 'live', 'degraded', 'recovery']);
const TRIGGER_SET: Set<PortfolioTriggerReason> = new Set([
  'bootstrap',
  'ui_default',
  'manual_refresh',
  'reconnect_recovery',
  'stale_reconciliation',
]);

export class PortfolioApiBlockedError extends Error {
  readonly statusCode = 409;
  readonly code = 'PORTFOLIO_API_BLOCKED';

  constructor(message: string) {
    super(message);
    this.name = 'PortfolioApiBlockedError';
  }
}

export function normalizePortfolioContext(
  partial?: Partial<PortfolioRequestContext> | null
): PortfolioRequestContext {
  const mode = partial?.mode && MODE_SET.has(partial.mode) ? partial.mode : DEFAULT_CONTEXT.mode;
  const triggerReason =
    partial?.triggerReason && TRIGGER_SET.has(partial.triggerReason)
      ? partial.triggerReason
      : DEFAULT_CONTEXT.triggerReason;
  return { mode, triggerReason };
}

export function parsePortfolioContextFromHeaders(
  headers: IncomingHttpHeaders
): PortfolioRequestContext {
  const modeHeader = headers['x-portfolio-session-mode'];
  const triggerHeader = headers['x-portfolio-trigger-reason'];

  const mode =
    typeof modeHeader === 'string' && MODE_SET.has(modeHeader as PortfolioSessionMode)
      ? (modeHeader as PortfolioSessionMode)
      : DEFAULT_CONTEXT.mode;
  const triggerReason =
    typeof triggerHeader === 'string' && TRIGGER_SET.has(triggerHeader as PortfolioTriggerReason)
      ? (triggerHeader as PortfolioTriggerReason)
      : DEFAULT_CONTEXT.triggerReason;

  return { mode, triggerReason };
}

export function isFreshnessApiAllowed(
  context: PortfolioRequestContext,
  liveModeAllowedTriggers: PortfolioTriggerReason[]
): boolean {
  if (context.mode !== 'live') return true;
  return liveModeAllowedTriggers.includes(context.triggerReason);
}

