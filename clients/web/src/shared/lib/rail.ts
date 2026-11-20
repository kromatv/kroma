import type { useBreakpoint } from '@kromatv/ui/kit';

type Step = ReturnType<typeof useBreakpoint>;

export const RAIL_WIDTH = 248;

export function hasRail(step: Step): boolean {
  return step === 'lg' || step === 'tv';
}

export function railInset(step: Step): number {
  return hasRail(step) ? RAIL_WIDTH : 0;
}
