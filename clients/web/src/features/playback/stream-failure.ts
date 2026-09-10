import type { StreamRefusal } from '@kromatv/core';
import { z } from 'zod';

/** Why a stream will not play: a refusal from the server, or `broken`, an
 * engine that failed past every recovery it has. */
export type StreamFailure = StreamRefusal | 'broken';

const BAD_HTTP_STATUS = 1001;

const ShakaHttpError = z.object({
  code: z.literal(BAD_HTTP_STATUS),
  data: z.array(z.unknown()),
});

const HttpStatus = z.number().int();

/** The HTTP status a Shaka load was rejected with, when the server answered one. */
export function shakaHttpStatus(error: unknown): number | null {
  const parsed = ShakaHttpError.safeParse(error);
  if (!parsed.success) return null;
  const status = HttpStatus.safeParse(parsed.data.data[1]);
  return status.success ? status.data : null;
}
