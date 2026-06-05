import { accountDeletionService } from './accountDeletion.service';
import { userRepository } from './repository';
import { portfolioRepository } from '../portfolio/repository';
import { accountDeletionRepository } from './accountDeletion.repository';
import { commentRepository } from '../comment/repository';
import { Comment } from '../comment/model';
import { NewsArticle } from '../news/models';
import { redis } from '../../config/redis';
import { alchemyNotify } from '../../utils/alchemyNotify';
import { zerionSubscriptions } from '../../utils/zerionSubscriptions';
import { disconnectNotifyClientsForUser } from '../../websocket/notificationFanout';
import { config } from '../../config/env';

jest.mock('./repository', () => ({
  userRepository: {
    findById: jest.fn(),
  },
}));

jest.mock('../portfolio/repository', () => ({
  portfolioRepository: {
    findWalletsByUser: jest.fn(),
  },
}));

jest.mock('./accountDeletion.repository', () => ({
  accountDeletionRepository: {
    purgeUserData: jest.fn(),
    deleteUserById: jest.fn(),
  },
}));

jest.mock('../comment/repository', () => ({
  commentRepository: {
    incrementReplyCount: jest.fn(),
  },
}));

jest.mock('../comment/model', () => ({
  Comment: {
    find: jest.fn(),
  },
}));

jest.mock('../news/models', () => ({
  NewsArticle: {
    updateOne: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  redis: {
    del: jest.fn(),
  },
}));

jest.mock('../../utils/alchemyNotify', () => ({
  alchemyNotify: {
    getWebhookIdForChain: jest.fn(),
    updateWebhookAddresses: jest.fn(),
  },
}));

jest.mock('../../utils/zerionSubscriptions', () => ({
  zerionSubscriptions: {
    patchWallets: jest.fn(),
  },
}));

jest.mock('../../websocket/notificationFanout', () => ({
  disconnectNotifyClientsForUser: jest.fn(),
}));

describe('accountDeletionService.deleteAccount', () => {
  const userId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    jest.clearAllMocks();
    (config as { allowProviderSubscriptionWrites: boolean }).allowProviderSubscriptionWrites = true;
    (config as { zerionSubscriptionId?: string }).zerionSubscriptionId = 'sub_1';

    (userRepository.findById as jest.Mock).mockResolvedValue({ _id: userId });
    (portfolioRepository.findWalletsByUser as jest.Mock).mockResolvedValue([
      { address: '0xabc123', chains: ['ethereum'] },
    ]);
    (Comment.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { parentId: 'parent_1', newsId: 'news_1' },
          { parentId: null, newsId: 'news_1' },
        ]),
      }),
    });
    (commentRepository.incrementReplyCount as jest.Mock).mockResolvedValue(undefined);
    (NewsArticle.updateOne as jest.Mock).mockResolvedValue(undefined);
    (accountDeletionRepository.purgeUserData as jest.Mock).mockResolvedValue(undefined);
    (accountDeletionRepository.deleteUserById as jest.Mock).mockResolvedValue(true);
    (redis.del as jest.Mock).mockResolvedValue(1);
    (alchemyNotify.getWebhookIdForChain as jest.Mock).mockReturnValue('wh_1');
    (alchemyNotify.updateWebhookAddresses as jest.Mock).mockResolvedValue(undefined);
    (zerionSubscriptions.patchWallets as jest.Mock).mockResolvedValue(undefined);
  });

  it('deregisters wallets, purges data, clears redis, disconnects ws, then deletes user', async () => {
    const result = await accountDeletionService.deleteAccount(userId);

    expect(result).toEqual({ deleted: true });
    expect(userRepository.findById).toHaveBeenCalledWith(userId);
    expect(portfolioRepository.findWalletsByUser).toHaveBeenCalledWith(userId);
    expect(alchemyNotify.updateWebhookAddresses).toHaveBeenCalledWith('wh_1', [], ['0xabc123']);
    expect(zerionSubscriptions.patchWallets).toHaveBeenCalledWith('sub_1', [], ['0xabc123']);
    expect(commentRepository.incrementReplyCount).toHaveBeenCalledWith('parent_1', -1);
    expect(NewsArticle.updateOne).toHaveBeenCalledWith(
      { externalId: 'news_1' },
      { $inc: { 'metrics.comments': -2 } }
    );
    expect(accountDeletionRepository.purgeUserData).toHaveBeenCalledWith(userId);
    expect(redis.del).toHaveBeenCalled();
    expect(disconnectNotifyClientsForUser).toHaveBeenCalledWith(userId);
    expect(accountDeletionRepository.deleteUserById).toHaveBeenCalledWith(userId);

    const purgeOrder = (accountDeletionRepository.purgeUserData as jest.Mock).mock
      .invocationCallOrder[0];
    const deleteUserOrder = (accountDeletionRepository.deleteUserById as jest.Mock).mock
      .invocationCallOrder[0];
    expect(purgeOrder).toBeLessThan(deleteUserOrder);
  });

  it('throws when user does not exist', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(null);

    await expect(accountDeletionService.deleteAccount(userId)).rejects.toThrow('User not found');
    expect(accountDeletionRepository.purgeUserData).not.toHaveBeenCalled();
    expect(accountDeletionRepository.deleteUserById).not.toHaveBeenCalled();
  });
});
