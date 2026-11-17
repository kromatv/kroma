import { type StreamRefusal, streamRefusal } from '@kromatv/core';
import { z } from 'zod';

/** Why a stream will not play: a refusal from the server, or `broken`, an
 * engine that failed past every recovery it has. */
export type StreamFailure = StreamRefusal | 'broken';

const BAD_HTTP_STATUS = 1001;
const CRITICAL = 2;

const ShakaHttpError = z.object({
  code: z.literal(BAD_HTTP_STATUS),
  data: z.array(z.unknown()),
});

const ShakaCriticalHttpError = ShakaHttpError.extend({ severity: z.literal(CRITICAL) });

const HttpStatus = z.number().int();

/** The HTTP status a Shaka load was rejected with, when the server answered one. */
export function shakaHttpStatus(error: unknown): number | null {
  const parsed = ShakaHttpError.safeParse(error);
  if (!parsed.success) {
    return null;
  }
  const status = HttpStatus.safeParse(parsed.data.data[1]);
  return status.success ? status.data : null;
}

/** Where an engine sends a stream it cannot carry on with. */
export interface FailureRoute {
  onGiveUp: () => void;
  onRefused: (status: number) => void;
}

/** Routes the HTTP status Shaka stopped streaming on: a refusal (see
 * `streamRefusal`) to `onRefused`, any other to `onGiveUp`. A failure Shaka
 * retries by itself, as it does on a stream still being produced, routes nowhere. */
export function routeShakaFailure(error: unknown, route: FailureRoute): void {
  if (!ShakaCriticalHttpError.safeParse(error).success) {
    return;
  }
  const status = shakaHttpStatus(error);
  if (status === null) {
    return;
  }
  if (streamRefusal(status)) {
    route.onRefused(status);
  } else {
    route.onGiveUp();
  }
}
