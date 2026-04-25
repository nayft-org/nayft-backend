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

  it('persists Solana activity with explorer URL when enrichment and receipt calls return empty', async () => {
    (alchemyApi.getAssetTransfers as jest.Mock).mockResolvedValue([]);
    (alchemyApi.getTransactionReceipt as jest.Mock).mockResolvedValue(null);

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

    expect(alchemyApi.getAssetTransfers).toHaveBeenCalledTimes(1);
    expect(alchemyApi.getTransactionReceipt).toHaveBeenCalledTimes(1);
    expect(portfolioRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'sol',
        enrichedData: {
          source: 'alchemy',
          transfers: [],
        },
        activity: expect.objectContaining({
          txHash: '5nSig',
          txStatus: 'pending',
        }),
      })
    );
  });

  it('persists webhook events even when EVM enrichment and receipt lookups return empty', async () => {
    (alchemyApi.getAssetTransfers as jest.Mock).mockResolvedValue([]);
    (alchemyApi.getTransactionReceipt as jest.Mock).mockResolvedValue(null);

    ingestWalletEvent({
      userId: 'user_2',
      address: '0x0a058183874ac70a0aaf91fcdc824112ad2445e0',
      chain: 'polygon',
      txHash: '0x1234',
      type: 'token_transfer',
      activity: {
        txHash: '0x1234',
        blockNum: '0x5203d7e',
        asset: 'USDC',
        value: 129.93,
        fromAddress: '0x1111111111111111111111111111111111111111',
        toAddress: '0x0a058183874ac70a0aaf91fcdc824112ad2445e0',
      },
    });

    await jest.runOnlyPendingTimersAsync();

    expect(alchemyApi.getAssetTransfers).toHaveBeenCalledTimes(1);
    expect(alchemyApi.getTransactionReceipt).toHaveBeenCalledTimes(1);
    expect(portfolioRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_2',
        chain: 'polygon',
        type: 'token_transfer',
        enrichedData: {
          source: 'alchemy',
          transfers: [],
        },
        activity: expect.objectContaining({
          txHash: '0x1234',
          txStatus: 'pending',
          explorerUrl: 'https://polygonscan.com/tx/0x1234',
        }),
      })
    );
  });
});
