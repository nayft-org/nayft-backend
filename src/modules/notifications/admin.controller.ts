import { Response } from 'express';
import { redis } from '../../config/redis';
import { NOTIF_STREAM_EVENTS, NOTIF_STREAM_DLQ } from '../../services/notificationEngine/redisKeys';
import { notifMetrics } from '../../observability/notifMetrics';
import { sendSuccess, sendError } from '../../utils/response';

export const notificationsAdminController = {
  health: async (_req: unknown, res: Response): Promise<void> => {
    try {
      const eventsLen = await redis.xlen(NOTIF_STREAM_EVENTS);
      const dlqLen = await redis.xlen(NOTIF_STREAM_DLQ);
      sendSuccess(res, {
        streamEventsLength: eventsLen,
        streamDlqLength: dlqLen,
        metrics: { ...notifMetrics },
      });
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : 'Failed', 500);
    }
  },
};
