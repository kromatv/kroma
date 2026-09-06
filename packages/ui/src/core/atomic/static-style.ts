// The shape of a style whose rules a build already wrote: the resolved
// longhands, as the runtime would have resolved them, carrying a mark the
// renderer reads as "compile me, insert nothing".

import type { SvStateName } from '#ui/core/states';

const STATIC = '$$static';

const STATES = '$$states';

export type StaticStates = Partial<Record<SvStateName, Record<string, unknown>>>;

export function isStaticStyle(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { $$static?: unknown }).$$static === true
  );
}

/** The interaction-state layers a static recipe layer carries. */
export function staticStates(style: Record<string, unknown>): StaticStates {
  return (style as Record<string, StaticStates | undefined>)[STATES] ?? {};
}

/** Marks a style as already in the sheet. Non-enumerable, so a key walk, a
 *  spread, `flatten` and the renderer's own compiler see only the longhands. */
export function markStatic(style: Record<string, unknown>, states?: StaticStates): void {
  Object.defineProperty(style, STATIC, { value: true });
  if (states) Object.defineProperty(style, STATES, { value: Object.freeze(states) });
}
