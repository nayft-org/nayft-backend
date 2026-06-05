import { redis } from '../../config/redis';
import { config } from '../../config/env';
import { alchemyNotify } from '../../utils/alchemyNotify';
import { zerionSubscriptions } from '../../utils/zerionSubscriptions';
import { piRedisKeys } from '../portfolio-intelligence/cache/piRedisKeys';
import { portfolioRepository } from '../portfolio/repository';
import { commentRepository } from '../comment/repository';
import { Comment } from '../comment/model';
import { NewsArticle } from '../news/models';
import { userRepository } from './repository';
import { accountDeletionRepository } from './accountDeletion.repository';
import { disconnectNotifyClientsForUser } from '../../websocket/notificationFanout';

function shortAddress(address: string | undefined | null): string {
  if (!address) return 'n/a';
  const value = String(address).toLowerCase();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function deregisterWalletAddresses(userId: string): Promise<void> {
  const wallets = await portfolioRepository.findWalletsByUser(userId);
  if (wallets.length === 0) return;

  if (!config.allowProviderSubscriptionWrites) {
    console.warn(
      '[AccountDeletion] allowProviderSubscriptionWrites=false — skipping Alchemy/Zerion deregistration'
    );
    return;
  }

  for (const wallet of wallets) {
    for (const chain of wallet.chains) {
      const webhookId = alchemyNotify.getWebhookIdForChain(chain);
      if (webhookId) {
        await alchemyNotify
          .updateWebhookAddresses(webhookId, [], [wallet.address])
          .catch((err) =>
            console.error(`[AccountDeletion] Alchemy deregister failed chain=${chain}:`, err)
          );
      }
    }

    if (config.zerionSubscriptionId) {
      await zerionSubscriptions
        .patchWallets(config.zerionSubscriptionId, [], [wallet.address])
        .catch((err) => console.error('[AccountDeletion] Zerion deregister failed:', err));
    }

    console.log('[AccountDeletion] Deregistered wallet', {
      userId,
      address: shortAddress(wallet.address),
    });
  }
}

async function reconcileUserComments(userId: string): Promise<void> {
  const userComments = await Comment.find({ userId }).select('parentId newsId').lean<
    Array<{ parentId?: string | null; newsId: string }>
  >();

  if (userComments.length === 0) return;

  const replyCountByParent = new Map<string, number>();
  const commentCountByNewsId = new Map<string, number>();

  for (const comment of userComments) {
    if (comment.parentId) {
      replyCountByParent.set(
        comment.parentId,
        (replyCountByParent.get(comment.parentId) ?? 0) + 1
      );
    }
    commentCountByNewsId.set(
      comment.newsId,
      (commentCountByNewsId.get(comment.newsId) ?? 0) + 1
    );
  }

  await Promise.all(
    [...replyCountByParent.entries()].map(([parentId, count]) =>
      commentRepository.incrementReplyCount(parentId, -count)
    )
  );

  await Promise.all(
    [...commentCountByNewsId.entries()].map(([newsId, count]) =>
      NewsArticle.updateOne({ externalId: newsId }, { $inc: { 'metrics.comments': -count } })
    )
  );
}

async function clearUserRedisKeys(userId: string): Promise<void> {
  const keys = [
    piRedisKeys.userRevision(userId),
    piRedisKeys.ingestRevision(userId),
    piRedisKeys.userManifest(userId),
    piRedisKeys.userPositions(userId),
    piRedisKeys.userAnalytics(userId),
    piRedisKeys.userAnalyticsStaging(userId),
    piRedisKeys.debounce(userId),
    piRedisKeys.pending(userId),
    piRedisKeys.lock(userId),
    piRedisKeys.wsSeq(userId),
    piRedisKeys.zerionCircuit(userId),
    piRedisKeys.feedContext(userId),
    `feed:context:${userId}:v2`,
  ];

  await redis.del(...keys).catch((err) => {
    console.error('[AccountDeletion] Redis cleanup failed:', err);
  });
}

export const accountDeletionService = {
  deleteAccount: async (userId: string): Promise<{ deleted: boolean }> => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    console.log('[AccountDeletion] Starting account deletion', { userId });

    await deregisterWalletAddresses(userId);
    await reconcileUserComments(userId);
    await accountDeletionRepository.purgeUserData(userId);
    await clearUserRedisKeys(userId);
    disconnectNotifyClientsForUser(userId);

    const deleted = await accountDeletionRepository.deleteUserById(userId);
    if (!deleted) {
      throw new Error('User not found');
    }

    console.log('[AccountDeletion] Account deleted', { userId });
    return { deleted: true };
  },
};
