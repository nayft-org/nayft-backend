import mongoose from 'mongoose';
import { NotificationModel } from './models/Notification';
import { NotificationPreferenceModel } from './models/NotificationPreference';
import { redis } from '../../config/redis';
import { notifUnreadKey } from '../../services/notificationEngine/redisKeys';
import { publishUserNotificationMessage } from '../../services/notificationEngine/publishUserNotification';

export interface NotificationCursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(p: NotificationCursorPayload): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): NotificationCursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const p = JSON.parse(json) as NotificationCursorPayload;
    if (!p?.createdAt || !p?.id) return null;
    return p;
  } catch {
    return null;
  }
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const notificationsService = {
  async listForUser(
    userId: string,
    opts: {
      limit?: number;
      cursor?: string;
      status?: 'unread' | 'all' | 'read';
      category?: string;
      sinceSeq?: number;
    }
  ) {
    const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const oid = new mongoose.Types.ObjectId(userId);
    const query: Record<string, unknown> = { userId: oid };
    if (opts.status === 'unread') query.status = 'unread';
    if (opts.status === 'read') query.status = 'read';
    if (opts.category) query.category = opts.category;
    if (typeof opts.sinceSeq === 'number' && opts.sinceSeq >= 0) {
      query.userSeq = { $gt: opts.sinceSeq };
    }

    const cursor = decodeCursor(opts.cursor);
    if (cursor) {
      const d = new Date(cursor.createdAt);
      const lastId = new mongoose.Types.ObjectId(cursor.id);
      query.$and = [
        {
          $or: [{ createdAt: { $lt: d } }, { createdAt: d, _id: { $lt: lastId } }],
        },
      ];
    }

    const docs = await NotificationModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const pageDocs = docs.slice(0, limit);
    const hasMore = docs.length > limit;
    let nextCursor: string | undefined;
    if (hasMore && pageDocs.length > 0) {
      const last = pageDocs[pageDocs.length - 1];
      nextCursor = encodeCursor({
        createdAt: new Date(last.createdAt).toISOString(),
        id: String(last._id),
      });
    }

    const unreadCount = await this.reconcileUnreadCount(userId);

    return {
      data: pageDocs.map((n) => ({
        id: String(n._id),
        userId: String(n.userId),
        category: n.category,
        type: n.type,
        priority: n.priority,
        title: n.title,
        body: n.body,
        data: n.data,
        status: n.status,
        userSeq: n.userSeq,
        createdAt: n.createdAt,
        readAt: n.readAt,
      })),
      page: { nextCursor, hasMore },
      unreadCount,
    };
  },

  async markRead(userId: string, notificationId: string): Promise<{ ok: boolean }> {
    type LeanDoc = { userSeq: number; readAt?: Date };
    const res = (await NotificationModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(notificationId),
        userId: new mongoose.Types.ObjectId(userId),
        status: 'unread',
      },
      { $set: { status: 'read', readAt: new Date() }, $inc: { version: 1 } },
      { new: true }
    ).lean()) as LeanDoc | null;

    if (res) {
      const n = await redis.decr(notifUnreadKey(userId));
      if (n < 0) await redis.set(notifUnreadKey(userId), '0');
      const unreadCount = Math.max(0, n);
      await publishUserNotificationMessage(userId, {
        channel: 'notifications',
        v: '1.0',
        type: 'notification:update',
        seq: res.userSeq,
        id: notificationId,
        patch: { status: 'read', readAt: res.readAt },
      });
      await publishUserNotificationMessage(userId, {
        channel: 'notifications',
        v: '1.0',
        type: 'notification:badge_update',
        seq: res.userSeq,
        unreadCount,
      });
    }
    return { ok: !!res };
  },

  async markAllRead(userId: string, category?: string): Promise<{ updated: number }> {
    const q: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
      status: 'unread',
    };
    if (category) q.category = category;

    const res = await NotificationModel.updateMany(q, {
      $set: { status: 'read', readAt: new Date() },
      $inc: { version: 1 },
    });

    const modified = typeof res.modifiedCount === 'number' ? res.modifiedCount : 0;
    const unreadCount = await NotificationModel.countDocuments({ userId: q.userId, status: 'unread' });
    await redis.set(notifUnreadKey(userId), String(unreadCount));

    await publishUserNotificationMessage(userId, {
      channel: 'notifications',
      v: '1.0',
      type: 'notification:badge_update',
      seq: Date.now(),
      unreadCount,
    });

    return { updated: modified };
  },

  async softDelete(userId: string, notificationId: string): Promise<{ ok: boolean }> {
    type LeanExist = { _id: mongoose.Types.ObjectId; status: string; userSeq: number };
    const existing = (await NotificationModel.findOne({
      _id: new mongoose.Types.ObjectId(notificationId),
      userId: new mongoose.Types.ObjectId(userId),
    }).lean()) as LeanExist | null;
    if (!existing) return { ok: false };

    await NotificationModel.updateOne(
      { _id: existing._id },
      { $set: { status: 'deleted' }, $inc: { version: 1 } }
    );

    if (existing.status === 'unread') {
      const n = await redis.decr(notifUnreadKey(userId));
      if (n < 0) await redis.set(notifUnreadKey(userId), '0');
    }

    const unreadCount = Math.max(
      0,
      parseInt((await redis.get(notifUnreadKey(userId))) ?? '0', 10)
    );

    await publishUserNotificationMessage(userId, {
      channel: 'notifications',
      v: '1.0',
      type: 'notification:delete',
      seq: existing.userSeq,
      id: notificationId,
    });
    await publishUserNotificationMessage(userId, {
      channel: 'notifications',
      v: '1.0',
      type: 'notification:badge_update',
      seq: existing.userSeq,
      unreadCount,
    });

    return { ok: true };
  },

  async getPreferences(userId: string) {
    let doc = await NotificationPreferenceModel.findOne({ userId: new mongoose.Types.ObjectId(userId) }).lean();
    if (!doc) {
      await NotificationPreferenceModel.create({
        userId: new mongoose.Types.ObjectId(userId),
        timezone: 'UTC',
        global: { enabled: true },
        categoryPrefs: {
          news: { enabled: true },
          market: { enabled: true },
          portfolio: { enabled: true },
          social: { enabled: true },
          security: { enabled: true },
        },
        channelPrefs: { push: { enabled: true } },
      });
      doc = await NotificationPreferenceModel.findOne({ userId: new mongoose.Types.ObjectId(userId) }).lean();
    }
    return doc;
  },

  async patchPreferences(userId: string, patch: Record<string, unknown>) {
    const oid = new mongoose.Types.ObjectId(userId);
    const updated = await NotificationPreferenceModel.findOneAndUpdate(
      { userId: oid },
      {
        $set: {
          ...(patch.global !== undefined ? { global: patch.global } : {}),
          ...(patch.categoryPrefs !== undefined ? { categoryPrefs: patch.categoryPrefs } : {}),
          ...(patch.typePrefs !== undefined ? { typePrefs: patch.typePrefs } : {}),
          ...(patch.quietHours !== undefined ? { quietHours: patch.quietHours } : {}),
          ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
          ...(patch.channelPrefs !== undefined ? { channelPrefs: patch.channelPrefs } : {}),
          ...(patch.digestPrefs !== undefined ? { digestPrefs: patch.digestPrefs } : {}),
        },
        $inc: { version: 1 },
      },
      { new: true, upsert: true }
    ).lean();
    return updated;
  },

  async reconcileUnreadCount(userId: string): Promise<number> {
    const mongoCount = await NotificationModel.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'unread',
    });
    const redisRaw = await redis.get(notifUnreadKey(userId));
    const redisCount = redisRaw ? parseInt(redisRaw, 10) : NaN;
    if (Number.isNaN(redisCount) || Math.abs(redisCount - mongoCount) > 2) {
      await redis.set(notifUnreadKey(userId), String(mongoCount));
      return mongoCount;
    }
    return mongoCount;
  },
};
