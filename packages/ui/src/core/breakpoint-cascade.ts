// The mobile-first cascade over the breakpoint scale, with no notion of where
// the active width comes from: what a value authored per breakpoint collapses
// to at a given step. The store that measures the surface is `breakpoint.ts`.

import { BREAKPOINTS, type BreakpointName, breakpoint } from '#ui/core/tokens/layout';

/**
 * A value stated per breakpoint, mobile-first: `base` is mandatory and applies
 * until the next breakpoint the object names. A missing middle step inherits
 * from below, never from above.
 */
export type Breakpoints<T> = { base: T } & {
  [K in Exclude<BreakpointName, 'base'>]?: T;
};

/** Any value in the vocabulary: one value, or one per breakpoint. */
export type Responsive<T> = T | Breakpoints<T>;

const WIDTH = BREAKPOINTS.map((name) => breakpoint[name]);

export const LAST_BREAKPOINT = BREAKPOINTS.length - 1;

/**
 * The attribute the store writes on the document root: a declaration a build
 * compiled paints through `:root[data-kroma-bp~="md"]` rather than a media
 * query, so the classes and the resolver never disagree about the step.
 */
export const BREAKPOINT_ATTRIBUTE = 'data-kroma-bp';

/** Every step reached at `index`, which is what the attribute carries: `~=`
 *  then matches a step from where it starts upwards, as the cascade does. */
export function stepsReached(index: number): string {
  return BREAKPOINTS.slice(0, Math.min(index, LAST_BREAKPOINT) + 1).join(' ');
}

/** The step a design width falls in, as a position in {@link BREAKPOINTS}. */
export function breakpointAt(width: number): number {
  let at = 0;
  while (at < LAST_BREAKPOINT && width >= (WIDTH[at + 1] as number)) at++;
  return at;
}

/**
 * Which breakpoints a value names, as a bitmask, and 0 for anything that is not
 * a breakpoint object - a plain value, an Animated node, a transform array.
 * Zero is the whole zero-cost path: it is what keeps a flat declaration off the
 * breakpoint axis, exactly as an empty state mask keeps it off the state axis.
 */
export function breakpointBits(value: unknown): number {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 0;
  let bits = 0;
  for (let at = 0; at <= LAST_BREAKPOINT; at++) {
    if ((BREAKPOINTS[at] as string) in value) bits |= 1 << at;
  }
  return bits;
}

/** The value at a breakpoint, mobile-first. A value naming no breakpoint at all
 *  passes through, so an Animated node stays itself. */
export function valueAt(value: object, index: number): unknown {
  const bag = value as Record<string, unknown>;
  for (let at = Math.min(index, LAST_BREAKPOINT); at >= 0; at--) {
    const found = bag[BREAKPOINTS[at] as string];
    if (found !== undefined) return found;
  }
  return breakpointBits(value) === 0 ? value : undefined;
}

/**
 * The step a declaration naming `mask` actually resolves at when the surface
 * is at `index`: the widest breakpoint it names at or below that one, and 0
 * when it names none.
 *
 * This is the cache-key axis. Two widths a declaration cannot tell apart share
 * one entry, and a declaration with no responsive value at all keys on 0
 * forever - so it mints exactly the one entry it does today.
 */
export function stepAt(mask: number, index: number): number {
  if (mask === 0) return 0;
  for (let step = Math.min(index, LAST_BREAKPOINT); step > 0; step--) {
    if ((mask & (1 << step)) !== 0) return step;
  }
  return 0;
}
