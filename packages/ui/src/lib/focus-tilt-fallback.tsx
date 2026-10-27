import type { ReactNode } from 'react';

export interface FocusTiltProps {
  /** Whether the content follows the thumb on the remote's touch surface. Only
   *  Apple TV tilts; elsewhere the children render as they are. */
  active: boolean;
  children: ReactNode;
}

/** The focus parallax of an Apple TV poster: while `active`, the content tilts
 *  toward the thumb on the Siri Remote, natively and without a render per frame. */
export function FocusTilt({ children }: Readonly<FocusTiltProps>) {
  return children;
}
