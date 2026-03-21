import { SystemEvent } from './event.model';
import type { EmitEventPayload } from './event.types';
import { featureExists } from '../feature-system/featureValidator';

export const eventService = {
  /** Raw persist to MongoDB. Used by emitEvent and queue worker. */
  async persistEvent(
    payload: EmitEventPayload,
    invalidFeature = false
  ): Promise<void> {
    const { featureKey, eventType, userId, metadata = {} } = payload;
    await SystemEvent.create({
      featureKey,
      eventType,
      userId,
      metadata,
      timestamp: new Date(),
      invalidFeature,
    });
    // #region agent log
    fetch('http://127.0.0.1:7927/ingest/46df119a-fef3-4d2e-b178-17829c05f667', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f20a21' },
      body: JSON.stringify({
        sessionId: 'f20a21',
        hypothesisId: 'H2',
        location: 'event.service.ts:persistEvent:afterCreate',
        message: 'SystemEvent persisted',
        data: { featureKey, eventType, invalidFeature },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  },

  async emitEvent(payload: EmitEventPayload): Promise<void> {
    const { featureKey } = payload;
    const exists = await featureExists(featureKey);
    // #region agent log
    fetch('http://127.0.0.1:7927/ingest/46df119a-fef3-4d2e-b178-17829c05f667', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f20a21' },
      body: JSON.stringify({
        sessionId: 'f20a21',
        hypothesisId: 'H2',
        location: 'event.service.ts:emitEvent:afterFeatureCheck',
        message: 'featureExists result',
        data: { featureKey, exists },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!exists) {
      console.warn(`[EventSystem] Invalid featureKey: ${featureKey}`);
      await this.persistEvent(payload, true);
      return;
    }
    await this.persistEvent(payload);
  },

  async getEventsByFeature(
    featureKey: string,
    options?: { from?: Date; to?: Date; limit?: number }
  ): Promise<{ eventType: string; count: number }[]> {
    const match: Record<string, unknown> = { featureKey };
    if (options?.from || options?.to) {
      match.timestamp = {};
      if (options.from) (match.timestamp as Record<string, Date>).$gte = options.from;
      if (options.to) (match.timestamp as Record<string, Date>).$lte = options.to;
    }

    const limit = options?.limit ?? 100;

    const results = await SystemEvent.aggregate([
      { $match: match },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { eventType: '$_id', count: 1, _id: 0 } },
    ]).exec();

    return results;
  },

  async getEventTrends(
    options?: { from?: Date; to?: Date; featureKey?: string }
  ): Promise<
    { featureKey: string; eventType: string; count: number; date: string }[]
  > {
    const match: Record<string, unknown> = {};
    if (options?.featureKey) match.featureKey = options.featureKey;
    if (options?.from || options?.to) {
      match.timestamp = {};
      if (options.from) (match.timestamp as Record<string, Date>).$gte = options.from;
      if (options.to) (match.timestamp as Record<string, Date>).$lte = options.to;
    }

    const results = await SystemEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            featureKey: '$featureKey',
            eventType: '$eventType',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          featureKey: '$_id.featureKey',
          eventType: '$_id.eventType',
          date: '$_id.date',
          count: 1,
          _id: 0,
        },
      },
      { $sort: { date: -1, count: -1 } },
      { $limit: 500 },
    ]).exec();

    return results;
  },
};
