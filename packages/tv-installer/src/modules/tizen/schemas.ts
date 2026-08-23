import { z } from 'zod';

const Short = z.string().max(200);

export const SamsungInfo = z.object({
  device: z.object({
    name: Short.optional(),
    model: Short.optional(),
    modelName: Short.optional(),
    ModelNumber: Short.optional(),
    developerMode: z.string().max(8).optional(),
    developerIP: z.string().max(64).optional(),
    OS: z.string().max(32).optional(),
  }),
});
export type SamsungInfo = z.infer<typeof SamsungInfo>;
