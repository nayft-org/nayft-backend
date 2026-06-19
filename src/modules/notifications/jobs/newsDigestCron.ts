import { randomUUID } from 'crypto';
import { config } from '../../../config/env';
import { featureService } from '../../../core/feature-system/feature.service';
import { appendNotificationEvent } from '../../../services/notificationEngine/notificationEventBus';
import { Follow } from '../../follow/model';
import { resolveFollowSymbolsForTargets } from '../../follow/resolveFollowSymbols';
import { NewsArticle } from '../../news/models/NewsArticle';
import { NotificationPreferenceModel } from '../models/NotificationPreference';
import mongoose from 'mongoose';

function hourBucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

async function newsCategoryEnabled(userId: string): Promise<boolean> {
  const prefs = await NotificationPreferenceModel.findOne({
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();
  if (!prefs) return true;
  const doc = prefs as { global?: { enabled?: boolean }; categoryPrefs?: Record<string, { enabled?: boolean }> };
  if (doc.global && doc.global.enabled === false) return false;
  const cat = doc.categoryPrefs?.news;
  if (cat && cat.enabled === false) return false;
  return true;
}

export async function runNewsDigestCron(): Promise<void> {
  const enabled = await featureService.isActive('notifications_news_alerts');
  if (!enabled) return;

  const since = new Date(Date.now() - config.notifNewsDigestWindowMs);
  const followerIds = await Follow.distinct('followerId', { targetType: 'coin' });
  const bucket = hourBucket();

  for (const userId of followerIds) {
    if (!(await newsCategoryEnabled(userId))) continue;

    const follows = await Follow.find({ followerId: userId, targetType: 'coin' })
      .select('targetId')
      .lean();
    if (follows.length === 0) continue;

    const targetIds = follows.map((f) => f.targetId);
    const symbols = await resolveFollowSymbolsForTargets(targetIds);
    if (symbols.length === 0) continue;

    const articles = await NewsArticle.find({
      publishedAt: { $gte: since },
      'coins.symbol': { $in: symbols },
      status: 'active',
    })
      .sort({ publishedAt: -1 })
      .limit(50)
      .select('externalId coins.symbol')
      .lean();

    if (articles.length === 0) continue;

    const matchedSymbols = new Set<string>();
    for (const a of articles) {
      for (const c of a.coins ?? []) {
        if (c.symbol && symbols.includes(c.symbol.toUpperCase())) {
          matchedSymbols.add(c.symbol.toUpperCase());
        }
      }
    }

    await appendNotificationEvent(
      JSON.stringify({
        eventId: randomUUID(),
        eventName: 'news.digest.v1',
        occurredAt: new Date().toISOString(),
        producer: 'news_digest_cron',
        schemaVersion: 1,
        idempotencyKey: `news:digest:${userId}:${bucket}`,
        body: {
          userId,
          articleCount: articles.length,
          articleIds: articles.slice(0, 5).map((a) => a.externalId),
          symbols: [...matchedSymbols],
        },
      })
    ).catch((err: unknown) => console.error('[newsDigestCron] emit failed', err));
  }
}
