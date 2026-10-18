import { useCallback, useSyncExternalStore } from 'react';
import { breakpointIndex, breakpointStep, currentBreakpoint } from './breakpoint';
import { useStyleScope } from './style-context';
import type { BreakpointName } from './tokens';

const EMPTY_SUBSCRIBE = () => () => {};
export function useBreakpoint(): BreakpointName {
  const { breakpoints } = useStyleScope();
  const read = useCallback(() => currentBreakpoint(breakpoints), [breakpoints]);
  return useSyncExternalStore(breakpoints?.subscribe ?? EMPTY_SUBSCRIBE, read, read);
}
export function useBreakpointIndex(): number {
  const { breakpoints } = useStyleScope();
  const read = useCallback(() => breakpointIndex(breakpoints), [breakpoints]);
  return useSyncExternalStore(breakpoints?.subscribe ?? EMPTY_SUBSCRIBE, read, read);
}
export function useBreakpointStep(mask: number): number {
  const { breakpoints } = useStyleScope();
  const read = useCallback(
    () => breakpointStep(mask, breakpointIndex(breakpoints)),
    [breakpoints, mask],
  );
  return useSyncExternalStore(breakpoints?.subscribe ?? EMPTY_SUBSCRIBE, read, read);
}
