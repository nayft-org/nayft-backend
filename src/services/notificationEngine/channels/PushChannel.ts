import type { HydratedDocument } from 'mongoose';
import { config } from '../../../config/env';
import { featureService } from '../../../core/feature-system/feature.service';
import type { INotification } from '../../../modules/notifications/models/Notification';
import { deviceSessionsService } from '../../../modules/notifications/deviceSessions.service';
import { NotificationPreferenceModel } from '../../../modules/notifications/models/NotificationPreference';
import { notifMetrics } from '../../../observability/notifMetrics';
import { notificationsService } from '../../../modules/notifications/service';
import mongoose from 'mongoose';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  badge?: number;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

function pushDataFromDoc(doc: HydratedDocument<INotification>): Record<string, string> {
  const data: Record<string, string> = {
    notificationId: String(doc._id),
    category: doc.category,
    type: doc.type,
  };
  const bag = doc.data;
  if (bag && typeof bag === 'object') {
    if (typeof bag.route === 'string') data.route = bag.route;
    if (typeof bag.coinId === 'string') data.coinId = bag.coinId;
    if (Array.isArray(bag.articleIds) && bag.articleIds.length > 0) {
      data.articleIds = bag.articleIds.slice(0, 5).join(',');
    }
  }
  return data;
}

async function pushEnabledForUser(userId: string): Promise<boolean> {
  const flagOn = await featureService.isActive('notifications_push');
  if (!flagOn) return false;

  const prefs = await NotificationPreferenceModel.findOne({
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();
  if (!prefs) return true;
  const doc = prefs as {
    global?: { enabled?: boolean };
    channelPrefs?: { push?: { enabled?: boolean } };
  };
  if (doc.global && typeof doc.global.enabled === 'boolean' && !doc.global.enabled) return false;
  if (
    doc.channelPrefs?.push &&
    typeof doc.channelPrefs.push.enabled === 'boolean' &&
    !doc.channelPrefs.push.enabled
  ) {
    return false;
  }
  return true;
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  notifMetrics.pushAttemptedTotal += messages.length;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.expoAccessToken) {
    headers.Authorization = `Bearer ${config.expoAccessToken}`;
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
  });

  if (!res.ok) {
    notifMetrics.pushFailedTotal += messages.length;
    console.error('[PushChannel] Expo HTTP error', res.status, await res.text().catch(() => ''));
    return;
  }

  const json = (await res.json()) as { data?: ExpoPushTicket | ExpoPushTicket[] };
  const tickets = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const token = messages[i]?.to;
    if (ticket?.status === 'ok') {
      notifMetrics.pushSucceededTotal += 1;
    } else {
      notifMetrics.pushFailedTotal += 1;
      const err = ticket?.details?.error ?? ticket?.message;
      if (err === 'DeviceNotRegistered' && token) {
        void deviceSessionsService.deactivateToken(token).catch(() => {});
      }
    }
  }
}

export const PushChannel = {
  async dispatch(doc: HydratedDocument<INotification>): Promise<{ sent: number; skipped?: boolean }> {
    const userId = String(doc.userId);
    if (doc.priority === 'BULK') {
      return { sent: 0, skipped: true };
    }

    const enabled = await pushEnabledForUser(userId);
    if (!enabled) {
      return { sent: 0, skipped: true };
    }

    const tokens = await deviceSessionsService.findActivePushTokens(userId);
    if (tokens.length === 0) {
      return { sent: 0, skipped: true };
    }

    const priority =
      doc.priority === 'CRITICAL' || doc.priority === 'IMPORTANT' ? 'high' : 'default';
    const data = pushDataFromDoc(doc);
    const badge = await notificationsService.reconcileUnreadCount(userId);
    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title: doc.title,
      body: doc.body,
      data,
      sound: 'default',
      priority,
      channelId: 'default',
      badge,
    }));

    await sendExpoPush(messages);
    return { sent: messages.length };
  },
};
