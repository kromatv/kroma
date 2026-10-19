import { use, useCallback, useSyncExternalStore } from 'react';
import { breakpointIndex, breakpointStep } from './breakpoint';
import { BreakpointIndexContext, useStyleScope } from './style-context';
import { BREAKPOINTS, type BreakpointName } from './tokens';

const EMPTY_SUBSCRIBE = () => () => {};
export function useBreakpoint(): BreakpointName {
  return BREAKPOINTS[useBreakpointIndex()] as BreakpointName;
}
export function useBreakpointIndex(): number {
  const { breakpoints } = useStyleScope();
  const at = use(BreakpointIndexContext);
  return at < 0 ? breakpointIndex(breakpoints) : at;
}
export function useBreakpointStep(mask: number): number {
  const { breakpoints } = useStyleScope();
  const read = useCallback(
    () => breakpointStep(mask, breakpointIndex(breakpoints)),
    [breakpoints, mask],
  );
  return useSyncExternalStore(breakpoints?.subscribe ?? EMPTY_SUBSCRIBE, read, read);
}
