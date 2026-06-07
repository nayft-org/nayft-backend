import { z } from 'zod';

const metadataValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

/** Bounded object metadata without z.record — registry validation in eventValidation.service. */
function parseBoundedMetadata(raw: unknown): Record<string, z.infer<typeof metadataValue>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, z.infer<typeof metadataValue>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 10)) {
    if (typeof k !== 'string' || k.length > 32) continue;
    const parsed = metadataValue.safeParse(v);
    if (parsed.success) out[k] = parsed.data;
  }
  return out;
}

export const emitEventSchema = z.object({
  featureKey: z.string().min(1).max(64),
  eventType: z.string().min(1).max(64),
  userId: z.string().optional(),
  metadata: z
    .unknown()
    .optional()
    .default({})
    .transform(parseBoundedMetadata),
  preValidated: z.boolean().optional(),
});

export type EmitEventSchemaInput = z.infer<typeof emitEventSchema>;
