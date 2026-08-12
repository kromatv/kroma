// The React face of the breakpoint store. Separate from breakpoint.ts so the
// store stays importable from non-React code (the resolver, tests, scripts).

import { useSyncExternalStore } from 'react';
import { breakpointStep, currentBreakpoint, subscribeBreakpoint } from '#ui/core/breakpoint';
import type { BreakpointName } from '#ui/core/tokens';

/**
 * The active breakpoint, live: re-renders the caller when the surface crosses
 * one. For a decision a style cannot carry - a different tree, a different
 * number of rails. A declaration that only CHANGES with the breakpoint says so
 * in the value (`px={{ base: 16, md: 40 }}`) and needs no hook.
 */
export function useBreakpoint(): BreakpointName {
  return useSyncExternalStore(subscribeBreakpoint, currentBreakpoint, currentBreakpoint);
}

/**
 * The breakpoint a declaration naming `mask` resolves at, live.
 *
 * Masked, so a crossing the declaration cannot see re-renders nobody, and
 * mounted only by the responsive half of <Box> and <Text>: a call site with no
 * breakpoint object subscribes to nothing.
 */
export function useBreakpointStep(mask: number): number {
  const read = () => breakpointStep(mask);
  return useSyncExternalStore(subscribeBreakpoint, read, read);
}
