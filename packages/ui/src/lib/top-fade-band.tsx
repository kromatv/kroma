import type { ReactNode } from 'react';

/** A copy of the backdrop over the top edge: while `active`, it hides scrolled content above `inset` and fades it back in over the next 160 px. `offset` is how far below the backdrop's origin the band's parent sits; no `children` fades to the ground colour. Nothing on native, which has no mask. */
export function TopFadeBand(
  _props: Readonly<{ inset: number; active: boolean; offset?: number; children?: ReactNode }>,
) {
  return null;
}
