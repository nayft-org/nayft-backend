import type { NotificationDomainEvent } from '../../modules/notifications/schema';

export type NotificationDraft = {
  userId: string;
  category: string;
  type: string;
  priority: 'CRITICAL' | 'IMPORTANT' | 'STANDARD' | 'BULK';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeHash: string;
  groupKey?: string;
  throttlePolicy?: string;
  throttleLimit?: number;
  throttleWindowSec?: number;
};

export function evaluateRules(ev: NotificationDomainEvent): NotificationDraft[] {
  const body = ev.body ?? {};
  const userId = typeof body.userId === 'string' ? body.userId : undefined;
  if (!userId) return [];

  switch (ev.eventName) {
    case 'auth.session.login.v1':
      return [
        {
          userId,
          category: 'security',
          type: 'login',
          priority: 'IMPORTANT',
          title: 'New login',
          body: 'We detected a successful login to your account.',
          data: { eventId: ev.eventId },
          dedupeHash: `login:${userId}:${ev.eventId}`,
          throttlePolicy: 'security_login',
          throttleLimit: 10,
          throttleWindowSec: 3600,
        },
      ];
    case 'auth.user.signup.v1':
      return [
        {
          userId,
          category: 'security',
          type: 'signup',
          priority: 'STANDARD',
          title: 'Welcome',
          body: 'Your account was created successfully.',
          data: { eventId: ev.eventId },
          dedupeHash: `signup:${userId}:${ev.eventId}`,
        },
      ];
    case 'portfolio.wallet.added.v1':
      return [
        {
          userId,
          category: 'portfolio',
          type: 'wallet_added',
          priority: 'STANDARD',
          title: 'Wallet connected',
          body: 'A wallet was added to your portfolio.',
          data: { ...(typeof body.metadata === 'object' && body.metadata ? (body.metadata as object) : {}), eventId: ev.eventId },
          dedupeHash: `wallet_added:${userId}:${ev.eventId}`,
        },
      ];
    case 'wallet.transfer_detected.v1': {
      const txStatus = body.txStatus as string | undefined;
      const priority: NotificationDraft['priority'] =
        txStatus === 'failed' ? 'IMPORTANT' : 'STANDARD';
      const walletAddress = String(body.walletAddress ?? '');
      return [
        {
          userId,
          category: 'portfolio',
          type: 'wallet_activity',
          priority,
          title: txStatus === 'failed' ? 'Transaction failed' : 'Wallet activity',
          body:
            txStatus === 'failed'
              ? 'A transaction on your wallet did not succeed.'
              : 'We detected new activity on one of your wallets.',
          data: {
            walletAddress,
            chain: body.chain,
            txHash: body.txHash,
            walletEventId: body.walletEventId,
            eventId: ev.eventId,
          },
          dedupeHash: `wallet:${userId}:${String(body.txHash ?? ev.eventId)}`,
          groupKey: walletAddress ? `wallet:${walletAddress}` : undefined,
          throttlePolicy: 'wallet_activity',
          throttleLimit: 30,
          throttleWindowSec: 60,
        },
      ];
    }
    case 'social.comment_reply.v1':
      return [
        {
          userId,
          category: 'social',
          type: 'comment_reply',
          priority: 'STANDARD',
          title: 'New reply',
          body: typeof body.preview === 'string' ? body.preview.slice(0, 280) : 'Someone replied to your comment.',
          data: {
            actorId: body.actorId,
            newsId: body.newsId,
            commentId: body.commentId,
            eventId: ev.eventId,
          },
          dedupeHash: `reply:${userId}:${String(body.commentId)}:${ev.eventId}`,
        },
      ];
    case 'social.new_follower.v1':
      return [
        {
          userId,
          category: 'social',
          type: 'new_follower',
          priority: 'STANDARD',
          title: 'New follower',
          body: 'You have a new follower.',
          data: { followerId: body.followerId, eventId: ev.eventId },
          dedupeHash: `follow:${userId}:${String(body.followerId)}:${ev.eventId}`,
          throttlePolicy: 'new_follower',
          throttleLimit: 60,
          throttleWindowSec: 3600,
        },
      ];
    case 'market.spike.v1': {
      const symbol = String(body.symbol ?? '').toUpperCase();
      const coinId = String(body.coinId ?? '');
      const pct = typeof body.percentChange24h === 'number' ? body.percentChange24h : 0;
      const sign = pct >= 0 ? '+' : '';
      const hour = new Date().toISOString().slice(0, 13);
      return [
        {
          userId,
          category: 'market',
          type: 'price_spike',
          priority: 'STANDARD',
          title: `${symbol} price alert`,
          body: `${symbol} moved ${sign}${pct.toFixed(1)}% in 24h`,
          data: {
            route: `/coin/${coinId}`,
            coinId,
            intelligence: {
              status: 'preview',
              reason: `${symbol} moved ${sign}${pct.toFixed(1)}% in 24h`,
            },
          },
          dedupeHash: `market:${coinId}:${userId}:${hour}`,
          throttlePolicy: 'market_spike',
          throttleLimit: 10,
          throttleWindowSec: 3600,
        },
      ];
    }
    case 'news.digest.v1': {
      const articleCount = typeof body.articleCount === 'number' ? body.articleCount : 0;
      const articleIds = Array.isArray(body.articleIds)
        ? body.articleIds.filter((id): id is string => typeof id === 'string')
        : [];
      const hour = new Date().toISOString().slice(0, 13);
      const title =
        articleCount === 1 ? '1 new update for assets you follow' : `${articleCount} new updates for assets you follow`;
      const route = articleCount === 1 && articleIds[0] ? '/(tabs)' : '/(tabs)';
      return [
        {
          userId,
          category: 'news',
          type: 'digest',
          priority: 'STANDARD',
          title: 'News update',
          body: title,
          data: {
            route,
            articleIds,
            intelligence: {
              status: 'preview',
              reason: title,
            },
          },
          dedupeHash: `news:digest:${userId}:${hour}`,
          throttlePolicy: 'news_digest',
          throttleLimit: 4,
          throttleWindowSec: 3600,
          groupKey: `news:digest:${userId}`,
        },
      ];
    }
    case 'portfolio.threshold.v1': {
      const pct = typeof body.relativeChange24h === 'number' ? body.relativeChange24h : 0;
      const direction = body.direction === 'down' ? 'down' : 'up';
      const sign = pct >= 0 ? '+' : '';
      const day = new Date().toISOString().slice(0, 10);
      return [
        {
          userId,
          category: 'portfolio',
          type: 'threshold',
          priority: 'STANDARD',
          title: 'Portfolio alert',
          body: `Your portfolio moved ${sign}${pct.toFixed(1)}% in 24h`,
          data: {
            route: '/(tabs)/portfolio',
            intelligence: {
              status: 'preview',
              reason: `Your portfolio moved ${sign}${pct.toFixed(1)}% in 24h`,
            },
          },
          dedupeHash: `portfolio:${userId}:${direction}:${day}`,
        },
      ];
    }
    default:
      return [];
  }
}
