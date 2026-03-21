import { z } from 'zod';

export const emitEventSchema = z.object({
  featureKey: z.string().min(1),
  eventType: z.string().min(1),
  userId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type EmitEventSchemaInput = z.infer<typeof emitEventSchema>;
