import mongoose from 'mongoose';
import { notificationDomainEventSchema, type NotificationDomainEvent } from '../../modules/notifications/schema';
import { featureService } from '../../core/feature-system/feature.service';
import { NotificationModel } from '../../modules/notifications/models/Notification';
import { NotificationPreferenceModel } from '../../modules/notifications/models/NotificationPreference';
import { evaluateRules } from './RuleEvaluator';
import { dedupeAllow } from './DedupeGuard';
import { throttleAllow } from './ThrottleGuard';
import { notifSeqKey, notifUnreadKey } from './redisKeys';
import { redis } from '../../config/redis';
import { publishUserNotificationMessage } from './publishUserNotification';
import { notifMetrics } from '../../observability/notifMetrics';
import { PushChannel } from './channels/PushChannel';
import { EmailChannel } from './channels/EmailChannel';
import { SmsChannel } from './channels/SmsChannel';

const DEDUPE_TTL_SEC = 86400;

function categoryAllowed(prefs: Record<string, unknown> | null | undefined, category: string): boolean {
  if (!prefs?.categoryPrefs || typeof prefs.categoryPrefs !== 'object') return true;
  const cat = (prefs.categoryPrefs as Record<string, { enabled?: boolean }>)[category];
  if (cat && typeof cat.enabled === 'boolean' && !cat.enabled) return false;
  return true;
}

async function ensurePrefs(userId: string): Promise<Record<string, unknown>> {
  const existing = await NotificationPreferenceModel.findOne({ userId }).lean();
  if (existing) return existing as unknown as Record<string, unknown>;
  const created = await NotificationPreferenceModel.create({
    userId: new mongoose.Types.ObjectId(userId),
    timezone: 'UTC',
    global: { enabled: true },
  });
  return created.toObject() as Record<string, unknown>;
}

export async function processNotificationDomainEvent(raw: unknown): Promise<void> {
  const parsed = notificationDomainEventSchema.safeParse(raw);
  if (!parsed.success) {
    notifMetrics.invalidEventTotal += 1;
    return;
  }
  const ev: NotificationDomainEvent = parsed.data;

  const enabled = await featureService.isActive('notifications');
  if (!enabled) {
    notifMetrics.skippedFeatureDisabledTotal += 1;
    return;
  }

  const drafts = evaluateRules(ev);
  for (const d of drafts) {
    await materializeDraft(ev, d).catch((err) => {
      console.error('[NotificationProcessor] materialize failed', err);
      notifMetrics.materializeErrorTotal += 1;
    });
  }
}

async function materializeDraft(ev: NotificationDomainEvent, d: ReturnType<typeof evaluateRules>[number]): Promise<void> {
  const prefs = await ensurePrefs(d.userId);
  if (!categoryAllowed(prefs, d.category)) {
    notifMetrics.skippedPreferenceTotal += 1;
    return;
  }

  if (d.throttlePolicy && d.throttleLimit && d.throttleWindowSec) {
    const ok = await throttleAllow(d.userId, d.throttlePolicy, d.throttleLimit, d.throttleWindowSec);
    if (!ok) {
      notifMetrics.skippedThrottleTotal += 1;
      return;
    }
  }

  const allowed = await dedupeAllow(d.userId, d.dedupeHash, DEDUPE_TTL_SEC);
  if (!allowed) {
    notifMetrics.skippedDedupeTotal += 1;
    return;
  }

  const oid = new mongoose.Types.ObjectId(d.userId);
  const userSeq = await redis.incr(notifSeqKey(d.userId));

  let doc;
  try {
    doc = await NotificationModel.create({
      userId: oid,
      category: d.category,
      type: d.type,
      priority: d.priority,
      title: d.title,
      body: d.body,
      data: d.data,
      status: 'unread',
      groupKey: d.groupKey,
      dedupeKey: d.dedupeHash,
      sourceEventId: ev.eventId,
      userSeq,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate') || msg.includes('E11000')) {
      notifMetrics.skippedDedupeTotal += 1;
      return;
    }
    throw e;
  }

  await redis.incr(notifUnreadKey(d.userId));
  notifMetrics.notificationsCreatedTotal += 1;

  const unreadRaw = await redis.get(notifUnreadKey(d.userId));
  const unreadCount = unreadRaw ? parseInt(unreadRaw, 10) : 0;

  const payloadNew = {
    channel: 'notifications',
    v: '1.0',
    type: 'notification:new',
    seq: userSeq,
    notification: {
      id: String(doc._id),
      userId: d.userId,
      category: d.category,
      type: d.type,
      priority: d.priority,
      title: d.title,
      body: d.body,
      data: d.data,
      status: 'unread',
      userSeq,
      createdAt: doc.createdAt,
    },
  };

  await publishUserNotificationMessage(d.userId, payloadNew);

  await publishUserNotificationMessage(d.userId, {
    channel: 'notifications',
    v: '1.0',
    type: 'notification:badge_update',
    seq: userSeq,
    unreadCount,
  });

  void PushChannel.dispatch(doc).catch(() => {});
  void EmailChannel.dispatch(doc).catch(() => {});
  void SmsChannel.dispatch(doc).catch(() => {});
}
