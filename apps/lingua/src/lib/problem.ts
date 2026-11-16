import { z } from 'zod';

/** Why a trip through GitHub could not finish: a sign-in, listing where the App may be created, or the return from creating it. */
export const Problem = z.enum([
  'sign-in-unavailable',
  'sign-in-expired',
  'sign-in-refused',
  'owners-unlisted',
  'setup-code-missing',
  'already-connected',
]);

/** Why a trip through GitHub could not finish. */
export type Problem = z.infer<typeof Problem>;

/** The page that explains `problem` and offers the way forward. */
export function problemPath(problem: Problem): string {
  return `/problem?reason=${problem}`;
}
