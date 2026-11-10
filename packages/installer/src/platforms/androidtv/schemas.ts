import { z } from 'zod';

const Short = z.string().max(200);

export const AndroidProps = z.object({
  'ro.build.version.release': Short.optional(),
  'ro.product.model': Short.optional(),
  'ro.product.manufacturer': Short.optional(),
});
export type AndroidProps = z.infer<typeof AndroidProps>;

export const PhilipsSystem = z.object({
  name: Short.optional(),
  model: Short.optional(),
  os_type: z.string().max(64).optional(),
});
export type PhilipsSystem = z.infer<typeof PhilipsSystem>;
