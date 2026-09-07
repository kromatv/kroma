import { z } from 'zod';

export const Hello = z.object({
  answer: z.string(),
});
export type Hello = z.infer<typeof Hello>;
