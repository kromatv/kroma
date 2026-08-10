// What a refused grant means, and whether the person can do anything about it.
//
// Told apart by status and never by the message: the server localizes before it
// answers, so a client reading the text would work in English and stop working
// in French.

import { KromaApiError } from '@kroma/client';

/** How many characters a television prints as its check string. */
export const HANDOFF_CHECK_LENGTH = 5;

/** The refusals that end the row rather than the attempt: the beacon is spent,
 * and no further code reaches it. */
export type FinalRefusal = 'checkTooMany' | 'gone';

/** Why a grant did not go through. Each name is also the tail of its copy's
 * key under `handoff.`, so a picker prints one without a table of its own. */
export type GrantRefusal = 'checkRequired' | 'checkWrong' | FinalRefusal;

/** How a grant went. `granted` is the television signing in; `dropped` is one
 * that was never sent, because another was already in flight. Naming those two
 * rather than leaving a bare `null` is deliberate: a caller that reads "no
 * refusal" as "signed in" would report a success nobody had. */
export type GrantResult = 'granted' | 'dropped' | GrantRefusal;

const BY_STATUS: Record<number, GrantRefusal> = {
  400: 'checkRequired',
  403: 'checkWrong',
  429: 'checkTooMany',
};

/** Read a refused `handoffGrant`. Anything the contract does not name - a
 * dropped request, a server having a bad time - reads as `gone`, the one answer
 * that offers the reader nothing to retry with. */
export function grantRefusal(cause: unknown): GrantRefusal {
  if (!(cause instanceof KromaApiError)) return 'gone';
  return BY_STATUS[cause.status] ?? 'gone';
}

/** True while the beacon is still standing and would take another code: keep
 * the prompt up. False once it is spent, and the row with it. */
export function checkRetryable(
  refusal: GrantRefusal,
): refusal is Exclude<GrantRefusal, FinalRefusal> {
  return refusal === 'checkRequired' || refusal === 'checkWrong';
}
