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
import { breakpointAt, stepAt } from '#ui/core/breakpoint-cascade';
import { BREAKPOINTS, type BreakpointName, CANVAS } from '#ui/core/tokens';

export type { Breakpoints, Responsive } from '#ui/core/breakpoint-cascade';
export { breakpointBits, valueAt } from '#ui/core/breakpoint-cascade';

/** Pure viewport reading for tools and declarations outside a mounted tree. */
function measure(): number {
  return Platform.isTV ? CANVAS.width : Dimensions.get('window').width;
}
export function createBreakpointRuntime(width?: number) {
  const listeners = new Set<() => void>();
  let pinned = width;
  let current = breakpointAt(pinned ?? measure());
  let holds = 0;
  let stop = () => {};
  const settle = () => {
    const next = breakpointAt(pinned ?? measure());
    if (next === current) return;
    current = next;
    for (const listener of listeners) listener();
  };
  return {
    index: () => current,
    pinDesignWidth(next?: number) {
      pinned = next;
      settle();
    },
    retain() {
      holds += 1;
      if (holds === 1) {
        settle();
        const sub = Dimensions.addEventListener('change', settle);
        stop = () => sub.remove();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        if (!holds) stop();
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export type BreakpointRuntime = ReturnType<typeof createBreakpointRuntime>;
export function breakpointIndex(runtime?: BreakpointRuntime): number {
  return runtime?.index() ?? breakpointAt(measure());
}
export function currentBreakpoint(runtime?: BreakpointRuntime): BreakpointName {
  return BREAKPOINTS[breakpointIndex(runtime)] as BreakpointName;
}
export function breakpointStep(mask: number, at = breakpointIndex()): number {
  return stepAt(mask, at);
}
