// The active breakpoint: where the design width comes from, and when it moves.
// The cascade a value resolves through is `breakpoint-cascade.ts`.
//
// React Native has no media query, so the width has to be read from the surface
// and re-read when it moves. That width is NOT always the window's: <TvStage>
// scales a fixed 1920x1080 canvas to fit the panel, so on a television the
// design's width is the canvas - Android TV reports 960x540 dp for exactly the
// 1080p screen a Tizen panel reports as 1920x1080. `Platform.isTV` answers that
// for the native TV shells; anything else painting on a fixed stage (a browser
// rendering <TvStage> at half size) states it with `pinDesignWidth`.

import { Dimensions, Platform } from 'react-native';
import {
  BREAKPOINT_ATTRIBUTE,
  breakpointAt,
  stepAt,
  stepsReached,
} from '#ui/core/breakpoint-cascade';
import { BREAKPOINTS, type BreakpointName, CANVAS } from '#ui/core/tokens';
import { webDocument } from '#ui/lib/dom';

export type { Breakpoints, Responsive } from '#ui/core/breakpoint-cascade';
export { breakpointBits, valueAt } from '#ui/core/breakpoint-cascade';

const listeners = new Set<() => void>();

let current = -1;
let pinned: number | undefined;

function measure(): number {
  if (pinned !== undefined) return pinned;
  if (Platform.isTV) return CANVAS.width;
  return Dimensions.get('window').width;
}

function stampStepOnRoot(index: number): void {
  webDocument()?.documentElement.setAttribute(BREAKPOINT_ATTRIBUTE, stepsReached(index));
}

function settle(): void {
  const next = breakpointAt(measure());
  if (next === current) return;
  current = next;
  stampStepOnRoot(next);
  for (const listener of listeners) listener();
}

/** The active breakpoint as a position in {@link BREAKPOINTS}, which is what
 *  the cascade and every cache key are expressed in. */
export function breakpointIndex(): number {
  if (current < 0) {
    Dimensions.addEventListener('change', settle);
    current = breakpointAt(measure());
    stampStepOnRoot(current);
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

/** The step a declaration naming `mask` resolves at, against the active
 *  breakpoint unless `at` says otherwise; see {@link stepAt}. */
export function breakpointStep(mask: number, at?: number): number {
  return stepAt(mask, at ?? breakpointIndex());
}
