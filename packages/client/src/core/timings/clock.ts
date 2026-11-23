/** Milliseconds on a clock that only moves forward, for measuring a span of
 *  time. Falls back to the wall clock on an engine (or a test) whose
 *  `performance` has no `now`. */
export function monotonicNow(): number {
  const performance: { now?: unknown } | undefined = globalThis.performance;
  return typeof performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}
