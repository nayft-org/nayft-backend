import { config } from '../config/env';
import { redis } from '../config/redis';

const ALCHEMY_RPC_BUDGET_KEY_PREFIX = 'alchemy:rpc:budget';

export type AlchemyRpcBudgetDecisionReason =
  | 'disabled'
  | 'within_budget'
  | 'over_budget'
  | 'redis_unavailable';

export interface AlchemyRpcBudgetDecision {
  allowed: boolean;
  reason: AlchemyRpcBudgetDecisionReason;
  key: string;
  day: string;
  count: number | null;
  limit: number;
}

function getUtcDayString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function getSecondsUntilNextUtcMidnight(now: Date): number {
  const nextMidnightUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((nextMidnightUtcMs - now.getTime()) / 1000));
}

export async function claimAlchemyRpcBudget(
  method: string,
  now: Date = new Date()
): Promise<AlchemyRpcBudgetDecision> {
  const day = getUtcDayString(now);
  const key = `${ALCHEMY_RPC_BUDGET_KEY_PREFIX}:${day}`;
  const limit = config.alchemyRpcDailyBudget;

  if (!config.alchemyRpcBudgetEnabled) {
    return {
      allowed: true,
      reason: 'disabled',
      key,
      day,
      count: null,
      limit,
    };
  }

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, getSecondsUntilNextUtcMidnight(now));
    }

    const allowed = count <= limit;
    if (!allowed) {
      console.warn('[AlchemyBudget] denied', {
        method,
        reason: 'over_budget',
        key,
        day,
        count,
        limit,
      });
    }

    return {
      allowed,
      reason: allowed ? 'within_budget' : 'over_budget',
      key,
      day,
      count,
      limit,
    };
  } catch (error) {
    console.error('[AlchemyBudget] redis unavailable; fail-closed deny', {
      method,
      reason: 'redis_unavailable',
      key,
      day,
      limit,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      allowed: false,
      reason: 'redis_unavailable',
      key,
      day,
      count: null,
      limit,
    };
  }
}
