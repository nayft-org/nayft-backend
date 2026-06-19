import { randomUUID } from 'crypto';
import { config } from '../../../config/env';
import { featureService } from '../../../core/feature-system/feature.service';
import { appendNotificationEvent } from '../../../services/notificationEngine/notificationEventBus';
import { Holding } from '../../portfolio/models/Holding';
import { NotificationPreferenceModel } from '../models/NotificationPreference';
import mongoose from 'mongoose';

function dateBucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function portfolioCategoryEnabled(userId: string): Promise<boolean> {
  const prefs = await NotificationPreferenceModel.findOne({
    userId: new mongoose.Types.ObjectId(userId),
  }).lean();
  if (!prefs) return true;
  const doc = prefs as { global?: { enabled?: boolean }; categoryPrefs?: Record<string, { enabled?: boolean }> };
  if (doc.global && doc.global.enabled === false) return false;
  const cat = doc.categoryPrefs?.portfolio;
  if (cat && cat.enabled === false) return false;
  return true;
}

export async function runPortfolioThresholdCron(): Promise<void> {
  const enabled = await featureService.isActive('notifications_portfolio_alerts');
  if (!enabled) return;

  const upThreshold = config.notifPortfolioUpPct;
  const downThreshold = config.notifPortfolioDownPct;
  const staleCutoff = new Date(Date.now() - config.notifHoldingsStaleMs);
  const day = dateBucket();

  const holdings = await Holding.find({
    syncedAt: { $gte: staleCutoff },
    totalValue: { $gt: 0 },
  })
    .select('userId relativeChange24h totalValue syncedAt')
    .lean();

  for (const h of holdings) {
    const userId = h.userId;
    if (!(await portfolioCategoryEnabled(userId))) continue;

    const pct = h.relativeChange24h ?? 0;
    let direction: 'up' | 'down' | null = null;
    if (pct >= upThreshold) direction = 'up';
    else if (pct <= downThreshold) direction = 'down';
    if (!direction) continue;

    await appendNotificationEvent(
      JSON.stringify({
        eventId: randomUUID(),
        eventName: 'portfolio.threshold.v1',
        occurredAt: new Date().toISOString(),
        producer: 'portfolio_threshold_cron',
        schemaVersion: 1,
        idempotencyKey: `portfolio:${userId}:${direction}:${day}`,
        body: {
          userId,
          relativeChange24h: pct,
          direction,
          totalValue: h.totalValue,
          syncedAt: new Date(h.syncedAt).toISOString(),
        },
      })
    ).catch((err: unknown) => console.error('[portfolioThresholdCron] emit failed', err));
  }
}
