// The active breakpoint: where the design width comes from, and how a value
// authored per breakpoint collapses to one.
//
// React Native has no media query, so the width has to be read from the surface
// and re-read when it moves. That width is NOT always the window's: <TvStage>
// scales a fixed 1920x1080 canvas to fit the panel, so on a television the
// design's width is the canvas - Android TV reports 960x540 dp for exactly the
// 1080p screen a Tizen panel reports as 1920x1080. `Platform.isTV` answers that
// for the native TV shells; anything else painting on a fixed stage (a browser
// rendering <TvStage> at half size) states it with `pinDesignWidth`.

import { Dimensions, Platform } from 'react-native';
import { BREAKPOINTS, type BreakpointName, breakpoint, CANVAS } from '#ui/core/tokens';

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

const LAST = BREAKPOINTS.length - 1;

const listeners = new Set<() => void>();

let current = -1;
let pinned: number | undefined;
let watching = false;

function indexOf(width: number): number {
  let at = 0;
  while (at < LAST && width >= (WIDTH[at + 1] as number)) at++;
  return at;
}

function measure(): number {
  if (pinned !== undefined) return pinned;
  if (Platform.isTV) return CANVAS.width;
  return Dimensions.get('window').width;
}

function settle(): void {
  const next = indexOf(measure());
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function watch(): void {
  if (watching) return;
  watching = true;
  Dimensions.addEventListener('change', settle);
}

/** The active breakpoint as a position in {@link BREAKPOINTS}, which is what
 *  the cascade and every cache key are expressed in. */
export function breakpointIndex(): number {
  if (current < 0) {
    watch();
    current = indexOf(measure());
  }
  return current;
}

/** The active breakpoint. */
export function currentBreakpoint(): BreakpointName {
  return BREAKPOINTS[breakpointIndex()] as BreakpointName;
}

/**
 * States the width every declaration resolves against, for a surface whose own
 * size is not the design's: `<TvStage>` paints a fixed `CANVAS.width` canvas
 * however small the window it is scaled into. Call it with nothing to follow
 * the viewport again.
 */
export function pinDesignWidth(width?: number): void {
  breakpointIndex();
  pinned = width;
  settle();
}

/** Subscribe to breakpoint CROSSINGS; returns the unsubscribe. A resize that
 *  stays inside one step notifies nobody. */
export function subscribeBreakpoint(listener: () => void): () => void {
  breakpointIndex();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
  for (let at = 0; at <= LAST; at++) {
    if ((BREAKPOINTS[at] as string) in value) bits |= 1 << at;
  }
  return bits;
}

/** The value at a breakpoint, mobile-first. A value naming no breakpoint at all
 *  passes through, so an Animated node stays itself. */
export function valueAt(value: object, index: number): unknown {
  const bag = value as Record<string, unknown>;
  for (let at = Math.min(index, LAST); at >= 0; at--) {
    const found = bag[BREAKPOINTS[at] as string];
    if (found !== undefined) return found;
  }
  return breakpointBits(value) === 0 ? value : undefined;
}

/**
 * The step a declaration naming `mask` actually resolves at: the widest
 * breakpoint it names at or below the active one, and 0 when it names none.
 *
 * This is the cache-key axis. Two widths a declaration cannot tell apart share
 * one entry, and a declaration with no responsive value at all keys on 0
 * forever - so it mints exactly the one entry it does today.
 */
export function breakpointStep(mask: number, at?: number): number {
  if (mask === 0) return 0;
  for (let step = Math.min(at ?? breakpointIndex(), LAST); step > 0; step--) {
    if ((mask & (1 << step)) !== 0) return step;
  }
  return 0;
}
