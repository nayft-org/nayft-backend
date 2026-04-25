import { alchemyApi } from '../utils/alchemy';
import { portfolioRepository } from '../modules/portfolio/repository';
import { ingestWalletEvent } from './walletEventAggregator';

jest.mock('../utils/alchemy', () => ({
  alchemyApi: {
    getAssetTransfers: jest.fn(),
    getTransactionReceipt: jest.fn(),
  },
}));

jest.mock('../utils/zerion', () => ({
  zerionApi: {
    getWalletPortfolio: jest.fn(),
    getWalletPositions: jest.fn(),
  },
}));

jest.mock('../modules/portfolio/repository', () => ({
  portfolioRepository: {
    createEvent: jest.fn(async (data) => ({ ...data, _id: 'evt_sol' })),
    findWalletsByUser: jest.fn(),
    upsertHoldings: jest.fn(),
  },
}));

describe('walletEventAggregator guarded chain paths', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists Solana activity with explorer URL without EVM enrichment or receipt refresh', async () => {
    ingestWalletEvent({
      userId: 'user_1',
      address: '7zQ3Rk9qN6LxVb2tP8sYaBcDeFgHiJkLmNoPqRsTuVw',
      chain: 'sol',
      txHash: '5nSig',
      type: 'token_transfer',
      activity: {
        txHash: '5nSig',
        asset: 'SOL',
        value: 1,
        fromAddress: '7zQ3Rk9qN6LxVb2tP8sYaBcDeFgHiJkLmNoPqRsTuVw',
      },
    });

    await jest.runOnlyPendingTimersAsync();

    expect(alchemyApi.getAssetTransfers).not.toHaveBeenCalled();
    expect(alchemyApi.getTransactionReceipt).not.toHaveBeenCalled();
    expect(portfolioRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'sol',
        enrichedData: null,
        activity: expect.objectContaining({
          txHash: '5nSig',
          explorerUrl: 'https://solscan.io/tx/5nSig',
        }),
      })
    );
    expect((portfolioRepository.createEvent as jest.Mock).mock.calls[0][0].activity).not.toHaveProperty('txStatus');
  });
});
