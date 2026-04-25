import axios from 'axios';
import { claimAlchemyRpcBudget } from '../services/alchemyRpcBudget';
import { alchemyApi } from './alchemy';

jest.mock('axios', () => ({
  create: jest.fn(),
}));

jest.mock('../config/env', () => ({
  config: {
    alchemyApiKey: 'test-api-key',
  },
}));

jest.mock('../services/alchemyRpcBudget', () => ({
  claimAlchemyRpcBudget: jest.fn(),
}));

const deniedDecision = {
  allowed: false,
  reason: 'over_budget' as const,
  key: 'alchemy:rpc:budget:2026-04-25',
  day: '2026-04-25',
  count: 101,
  limit: 100,
};

describe('alchemyApi budget guard integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty transfers when budget is denied without making HTTP call', async () => {
    (claimAlchemyRpcBudget as jest.Mock).mockResolvedValueOnce(deniedDecision);

    const result = await alchemyApi.getAssetTransfers('0xabc', 'polygon');

    expect(result).toEqual([]);
    expect(claimAlchemyRpcBudget).toHaveBeenCalledWith('alchemy_getAssetTransfers');
    expect(axios.create).not.toHaveBeenCalled();
  });

  it('returns null receipt when budget is denied without fallback HTTP calls', async () => {
    (claimAlchemyRpcBudget as jest.Mock).mockResolvedValueOnce(deniedDecision);

    const result = await alchemyApi.getTransactionReceipt('0x1234', 'polygon');

    expect(result).toBeNull();
    expect(claimAlchemyRpcBudget).toHaveBeenCalledWith('eth_getTransactionReceipt');
    expect(axios.create).not.toHaveBeenCalled();
  });

  it('returns empty token balances when budget is denied without making HTTP call', async () => {
    (claimAlchemyRpcBudget as jest.Mock).mockResolvedValueOnce(deniedDecision);

    const result = await alchemyApi.getTokenBalances('0xabc', 'polygon');

    expect(result).toEqual([]);
    expect(claimAlchemyRpcBudget).toHaveBeenCalledWith('alchemy_getTokenBalances');
    expect(axios.create).not.toHaveBeenCalled();
  });
});
