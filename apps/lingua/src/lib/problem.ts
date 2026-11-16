import { z } from 'zod';

/** Why a sign-in through GitHub could not finish. */
export const Problem = z.enum(['sign-in-unavailable', 'sign-in-expired', 'sign-in-refused']);

/** Why a trip through GitHub could not finish. */
export type Problem = z.infer<typeof Problem>;

/** The page that explains `problem` and offers the way forward. */
export function problemPath(problem: Problem): string {
  return `/problem?reason=${problem}`;
}
