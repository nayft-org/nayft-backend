import { redis } from '../config/redis';
import { claimAlchemyRpcBudget } from './alchemyRpcBudget';

jest.mock('../config/env', () => ({
  config: {
    alchemyRpcBudgetEnabled: true,
    alchemyRpcDailyBudget: 100,
  },
}));

jest.mock('../config/redis', () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn(),
  },
}));

describe('alchemyRpcBudget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis.expire as jest.Mock).mockResolvedValue(1);
  });

  it('allows counts 1..100 and denies 101 on the same UTC day', async () => {
    const counters = new Map<string, number>();
    (redis.incr as jest.Mock).mockImplementation(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    });

    const now = new Date('2026-04-25T10:00:00.000Z');

    for (let i = 0; i < 100; i += 1) {
      const decision = await claimAlchemyRpcBudget('alchemy_getAssetTransfers', now);
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('within_budget');
      expect(decision.count).toBe(i + 1);
    }

    const denied = await claimAlchemyRpcBudget('alchemy_getAssetTransfers', now);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('over_budget');
    expect(denied.count).toBe(101);
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it('resets budget across UTC day boundary', async () => {
    const counters = new Map<string, number>();
    (redis.incr as jest.Mock).mockImplementation(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    });

    const day1 = new Date('2026-04-25T23:59:58.000Z');
    const day2 = new Date('2026-04-26T00:00:02.000Z');

    const first = await claimAlchemyRpcBudget('eth_getTransactionReceipt', day1);
    const second = await claimAlchemyRpcBudget('eth_getTransactionReceipt', day2);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(first.key).not.toBe(second.key);
    expect(first.day).toBe('2026-04-25');
    expect(second.day).toBe('2026-04-26');
    expect(redis.expire).toHaveBeenCalledTimes(2);
  });

  it('denies calls when redis is unavailable (fail-closed)', async () => {
    (redis.incr as jest.Mock).mockRejectedValueOnce(new Error('redis down'));

    const denied = await claimAlchemyRpcBudget('alchemy_getTokenBalances', new Date('2026-04-25T00:00:00.000Z'));

    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('redis_unavailable');
    expect(denied.count).toBeNull();
    expect(redis.expire).not.toHaveBeenCalled();
  });
});
