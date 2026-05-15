import { z } from 'zod';

/** Normalized notification domain event envelope (RFC Section 4). */
export const notificationDomainEventSchema = z.object({
  eventId: z.string().min(1),
  eventName: z.string().min(1),
  occurredAt: z.string().min(1),
  producer: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  traceId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  body: z.record(z.string(), z.unknown()),
});

export type NotificationDomainEvent = z.infer<typeof notificationDomainEventSchema>;
