import type { ReactNode } from 'react';

/** A copy of the backdrop over the top edge: it hides scrolled content above `inset` and fades it back in over the next 48 px. Nothing on native, which has no mask. */
export function TopFadeBand(_props: Readonly<{ inset: number; children: ReactNode }>) {
  return null;
}
