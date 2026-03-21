import { z } from 'zod';

export const patchFeatureSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one of name, description, isActive must be provided' }
  );

export type PatchFeatureInput = z.infer<typeof patchFeatureSchema>;
