import { randomUUID } from 'crypto';
import { config } from '../../../config/env';
import { featureService } from '../../../core/feature-system/feature.service';
import { appendNotificationEvent } from '../../../services/notificationEngine/notificationEventBus';
import { Follow } from '../../follow/model';
import { Coin } from '../../coin/model';

function hourBucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

export async function runMarketSpikeCron(): Promise<void> {
  const enabled = await featureService.isActive('notifications_market_alerts');
  if (!enabled) return;

  const threshold = config.notifMarketSpikePct;
  const followedIds = await Follow.distinct('targetId', { targetType: 'coin' });
  if (followedIds.length === 0) return;

  const spikedCoins = await Coin.find({
    coinId: { $in: followedIds },
    $or: [
      { percentChange24h: { $gte: threshold } },
      { percentChange24h: { $lte: -threshold } },
    ],
  })
    .select('coinId symbol percentChange24h')
    .lean();

  const bucket = hourBucket();

  for (const coin of spikedCoins) {
    const pct = coin.percentChange24h ?? 0;
    const symbol = (coin.symbol ?? coin.coinId).toUpperCase();
    const followers = await Follow.find({
      targetType: 'coin',
      targetId: coin.coinId,
    })
      .select('followerId')
      .lean();

    for (const f of followers) {
      const userId = f.followerId;
      await appendNotificationEvent(
        JSON.stringify({
          eventId: randomUUID(),
          eventName: 'market.spike.v1',
          occurredAt: new Date().toISOString(),
          producer: 'market_spike_cron',
          schemaVersion: 1,
          idempotencyKey: `market:${coin.coinId}:${userId}:${bucket}`,
          body: {
            userId,
            coinId: coin.coinId,
            symbol,
            percentChange24h: pct,
          },
        })
      ).catch((err: unknown) => console.error('[marketSpikeCron] emit failed', err));
    }
  }
}
