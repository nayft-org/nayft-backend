/**
 * DEV-ONLY: send one test push notification per notification category ("segment" —
 * security, portfolio, social, market, news) to a given user. Refuses to run when
 * NODE_ENV=production.
 *
 * Bypasses rule evaluation/dedupe/throttle (writes NotificationModel docs directly)
 * but still goes through the real PushChannel.dispatch(), so it respects the
 * `notifications_push` feature flag and the user's NotificationPreference — if a
 * segment doesn't send, check those first.
 *
 * Run:
 *   cd crypto-backend && npx ts-node --transpile-only scripts/send-test-notifications.ts <userId>
 *   or: USER_ID=<id> npm run script:send-test-notifications
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { NotificationModel } from '../src/modules/notifications/models/Notification';
import { PushChannel } from '../src/services/notificationEngine/channels/PushChannel';
import { publishUserNotificationMessage } from '../src/services/notificationEngine/publishUserNotification';
import { notifSeqKey, notifUnreadKey } from '../src/services/notificationEngine/redisKeys';
import { redis } from '../src/config/redis';

if ((process.env.NODE_ENV || 'development') === 'production') {
  console.error('Refusing to run: scripts/send-test-notifications.ts is dev-only (NODE_ENV=production).');
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27020/crypto_db';

type Segment = {
  category: string;
  type: string;
  title: string;
  body: string;
  priority: 'CRITICAL' | 'IMPORTANT' | 'STANDARD' | 'BULK';
};

const SEGMENTS: Segment[] = [
  { category: 'security', type: 'login', title: '[TEST] New login detected', body: 'Security test notification.', priority: 'CRITICAL' },
  { category: 'portfolio', type: 'threshold', title: '[TEST] Portfolio alert', body: 'Portfolio test notification.', priority: 'IMPORTANT' },
  { category: 'social', type: 'new_follower', title: '[TEST] New follower', body: 'Social test notification.', priority: 'STANDARD' },
  { category: 'market', type: 'price_spike', title: '[TEST] Market spike', body: 'Market test notification.', priority: 'IMPORTANT' },
  { category: 'news', type: 'digest', title: '[TEST] News digest', body: 'News test notification.', priority: 'STANDARD' },
];

async function sendSegment(userId: string, seg: Segment): Promise<void> {
  const userSeq = await redis.incr(notifSeqKey(userId));

  const doc = await NotificationModel.create({
    userId: new mongoose.Types.ObjectId(userId),
    category: seg.category,
    type: seg.type,
    priority: seg.priority,
    title: seg.title,
    body: seg.body,
    data: { test: true },
    status: 'unread',
    userSeq,
  });

  await redis.incr(notifUnreadKey(userId));

  await publishUserNotificationMessage(userId, {
    channel: 'notifications',
    v: '1.0',
    type: 'notification:new',
    seq: userSeq,
    notification: {
      id: String(doc._id),
      userId,
      category: seg.category,
      type: seg.type,
      priority: seg.priority,
      title: seg.title,
      body: seg.body,
      data: doc.data,
      status: 'unread',
      userSeq,
      createdAt: doc.createdAt,
    },
  });

  const result = await PushChannel.dispatch(doc);
  const outcome = result.skipped ? 'SKIPPED (check notifications_push flag / user prefs / device tokens)' : `sent to ${result.sent} device(s)`;
  console.log(`[${seg.category}/${seg.type}] notification=${doc._id} -> ${outcome}`);
}

async function main(): Promise<void> {
  const userId = process.argv[2] || process.env.USER_ID;
  if (!userId) {
    console.error('Usage: ts-node scripts/send-test-notifications.ts <userId>');
    console.error('   or: USER_ID=<id> npm run script:send-test-notifications');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log(`Sending ${SEGMENTS.length} test notifications (one per segment) to user ${userId}...`);

  for (const seg of SEGMENTS) {
    await sendSegment(userId, seg).catch((err) => {
      console.error(`[${seg.category}/${seg.type}] FAILED`, err);
    });
  }

  await mongoose.disconnect();
  await redis.quit();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
