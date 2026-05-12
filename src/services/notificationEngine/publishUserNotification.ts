import { redis } from '../../config/redis';
import { notifyUserChannel } from './redisKeys';

export async function publishUserNotificationMessage(userId: string, message: Record<string, unknown>): Promise<void> {
  await redis.publish(notifyUserChannel(userId), JSON.stringify(message));
}
