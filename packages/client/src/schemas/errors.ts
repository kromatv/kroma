// Runtime schema for the JSON body the server answers a failed request with,
// the payload a `KromaApiError` carries. Every field is optional: which ones come
// back is decided by the endpoint that failed, and one field arriving malformed
// must not cost the caller the others.

import { z } from 'zod';

/** The server's error payload. `retryAfter` is a whole number of seconds;
 * `tokenInvalid` marks an access token no PIN can rescue; `pinRequired` marks a
 * profile locked behind a PIN. */
export const ApiErrorBody = z.object({
  error: z.string().optional().catch(undefined),
  retryAfter: z.number().int().positive().optional().catch(undefined),
  tokenInvalid: z.boolean().optional().catch(undefined),
  pinRequired: z.boolean().optional().catch(undefined),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
