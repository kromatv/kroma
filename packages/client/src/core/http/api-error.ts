import { z } from 'zod';

export class KromaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'KromaApiError';
  }
}

/** A 2xx body the response schema rejected: the server answered, but not with
 * what this build was written against. Distinct from {@link KromaApiError} so a
 * caller can tell "the request failed" from "we cannot read the answer", and it
 * names the path plus the offending fields instead of surfacing a bare
 * `ZodError`. */
export class KromaSchemaError extends Error {
  constructor(
    readonly path: string,
    readonly issues: readonly z.core.$ZodIssue[],
  ) {
    super(`${path} answered a body this build cannot read: ${summarize(issues)}`);
    this.name = 'KromaSchemaError';
  }
}

function summarize(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/** The server's error payload. Every field is optional: which ones come back is
 * decided by the endpoint that failed, and one field arriving malformed must not
 * cost the caller the others. `retryAfter` is a whole number of seconds;
 * `tokenInvalid` marks an access token no PIN can rescue; `pinRequired` marks a
 * profile locked behind a PIN. */
export const ApiErrorBody = z.object({
  error: z.string().optional().catch(undefined),
  retryAfter: z.number().int().positive().optional().catch(undefined),
  tokenInvalid: z.boolean().optional().catch(undefined),
  pinRequired: z.boolean().optional().catch(undefined),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/** The server's error payload behind a thrown request error, validated. Empty
 * for anything that is not a {@link KromaApiError} and for a body the server
 * did not shape (so a caller reads a flag without ever casting). */
export function apiErrorBody(e: unknown): ApiErrorBody {
  if (!(e instanceof KromaApiError)) return {};
  const parsed = ApiErrorBody.safeParse(e.body);
  return parsed.success ? parsed.data : {};
}

/** The human-facing message for a thrown request error: the server's `{ error }`
 * text when present (far more useful than the generic "GET … failed (400)"),
 * otherwise the provided localized `fallback`. */
export function apiErrorText(e: unknown, fallback: string): string {
  return apiErrorBody(e).error?.trim() || fallback;
}
