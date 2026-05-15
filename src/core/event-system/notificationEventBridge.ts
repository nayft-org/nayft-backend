import { randomUUID } from 'crypto';
import type { EmitEventPayload } from './event.types';
import { appendNotificationEvent } from '../../services/notificationEngine/notificationEventBus';
import type { NotificationDomainEvent } from '../../modules/notifications/schema';
import type { IWalletEvent } from '../../modules/portfolio/models/WalletEvent';

function baseEnvelope(
  eventName: string,
  producer: string,
  body: Record<string, unknown>
): NotificationDomainEvent {
  return {
    eventId: randomUUID(),
    eventName,
    occurredAt: new Date().toISOString(),
    producer,
    schemaVersion: 1,
    body,
  };
}

async function publish(ev: NotificationDomainEvent): Promise<void> {
  await appendNotificationEvent(JSON.stringify(ev));
}

/** Map analytics system_events into notification stream (subset). */
export async function bridgeSystemEventToNotificationStream(payload: EmitEventPayload): Promise<void> {
  const { featureKey, eventType, userId, metadata = {} } = payload;
  if (!userId) return;

  const key = `${featureKey}:${eventType}`;
  const map: Record<string, string> = {
    'auth:login': 'auth.session.login.v1',
    'auth:signup': 'auth.user.signup.v1',
    'portfolio_tracking:wallet_added': 'portfolio.wallet.added.v1',
  };
  const eventName = map[key];
  if (!eventName) return;

  await publish(
    baseEnvelope(eventName, 'system_events', {
      userId,
      metadata,
    })
  );
}

export async function publishWalletActivity(saved: IWalletEvent): Promise<void> {
  const userId = typeof saved.userId === 'string' ? saved.userId : String(saved.userId);
  const addr = saved.address?.toLowerCase?.() ?? String(saved.address);
  await publish(
    baseEnvelope('wallet.transfer_detected.v1', 'wallet_aggregator', {
      userId,
      walletAddress: addr,
      chain: saved.chain,
      txHash: saved.activity?.txHash,
      direction: saved.type,
      eventType: saved.type,
      walletEventId: String(saved._id),
      txStatus: saved.activity?.txStatus,
    })
  );
}

export async function publishCommentReply(params: {
  recipientUserId: string;
  actorUserId: string;
  newsId: string;
  commentId: string;
  preview: string;
}): Promise<void> {
  await publish(
    baseEnvelope('social.comment_reply.v1', 'comment_service', {
      userId: params.recipientUserId,
      actorId: params.actorUserId,
      newsId: params.newsId,
      commentId: params.commentId,
      preview: params.preview,
    })
  );
}

export async function publishNewFollower(params: {
  targetUserId: string;
  followerId: string;
}): Promise<void> {
  await publish(
    baseEnvelope('social.new_follower.v1', 'follow_service', {
      userId: params.targetUserId,
      followerId: params.followerId,
    })
  );
}
