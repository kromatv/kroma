/**
 * Record a failure where a Worker's logs keep it: `wrangler tail` and the
 * dashboard read the console. `what` says what did not happen, in a few words.
 */
export function report(what: string, error: unknown): void {
  console.error(`lingua: ${what}`, error);
}
