import type { ReactNode } from 'react';

/** Whether a page frame can mask what scrolls inside it. */
export const FRAME_MASKS = false;

/** A page frame that hides what scrolls above `inset` while `active`; the browser targets mask the content itself instead. */
export function FrameMask({
  children,
}: Readonly<{ inset: number; active: boolean; children: ReactNode }>): ReactNode {
  return children;
}
