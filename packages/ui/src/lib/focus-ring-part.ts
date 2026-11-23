import { createContext, useContext } from 'react';
import type { RingToken } from '#ui/core/theme';

/** What a <Focusable> tells a <FocusRing> inside it: whether its focus is
 *  showing, which ring it would draw, and how to take the ring off itself. */
export interface FocusRingPart {
  visible: boolean;
  token: RingToken | null;
  claim: () => () => void;
}

const FocusRingPartContext = createContext<FocusRingPart | null>(null);

export const FocusRingPartProvider = FocusRingPartContext.Provider;

/** The nearest <Focusable>'s ring, for a part that wears it. */
export function useFocusRingPart(): FocusRingPart | null {
  return useContext(FocusRingPartContext);
}
