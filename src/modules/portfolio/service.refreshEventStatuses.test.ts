import { portfolioService } from './service';
import { portfolioRepository } from './repository';
import { alchemyApi } from '../../utils/alchemy';

jest.mock('./repository', () => ({
  portfolioRepository: {
    findEventsNeedingStatusRefresh: jest.fn(),
    updateEventActivity: jest.fn(),
  },
}));

jest.mock('../../utils/alchemy', () => ({
  alchemyApi: {
    getTransactionReceipt: jest.fn(),
  },
}));

jest.mock('../../core/event-system', () => ({
  eventService: {
    emitEvent: jest.fn(),
  },
}));

jest.mock('../../services/walletEventAggregator', () => ({
  emitHoldingsDeltaUpdate: jest.fn(),
  emitWalletStatusUpdate: jest.fn(),
}));

describe('portfolioService.refreshEventStatuses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns updated=0 when receipts are unavailable (budget-denied path)', async () => {
    const mockedRepo = portfolioRepository as jest.Mocked<typeof portfolioRepository>;
    const mockedAlchemy = alchemyApi as jest.Mocked<typeof alchemyApi>;

    mockedRepo.findEventsNeedingStatusRefresh.mockResolvedValue([
      {
        _id: 'evt_1',
        userId: 'user_1',
        address: '0xabc',
        chain: 'polygon',
        type: 'token_transfer',
        rawEventCount: 1,
        enrichedData: null,
        aggregatedAt: new Date('2026-04-25T11:00:00.000Z'),
        activity: {
          txHash: '0xaaa',
          txStatus: 'pending',
        },
      } as any,
      {
        _id: 'evt_2',
        userId: 'user_1',
        address: '0xabc',
        chain: 'polygon',
        type: 'token_transfer',
        rawEventCount: 1,
        enrichedData: null,
        aggregatedAt: new Date('2026-04-25T11:01:00.000Z'),
        activity: {
          txHash: '0xbbb',
        },
      } as any,
    ]);
    mockedAlchemy.getTransactionReceipt.mockResolvedValue(null);

    const result = await portfolioService.refreshEventStatuses('user_1', {
      mode: 'bootstrap',
      triggerReason: 'bootstrap',
    });

    expect(result).toEqual({ updated: 0 });
    expect(mockedRepo.findEventsNeedingStatusRefresh).toHaveBeenCalledWith('user_1', 200);
    expect(mockedAlchemy.getTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(mockedRepo.updateEventActivity).not.toHaveBeenCalled();
  });
});
