import { createContext, useContext } from 'react';
import type { RingToken } from '#ui/core/theme';
import type { Radius } from '#ui/core/tokens/layout';

/** Where a focus ring is drawn. `outside` stands it off the control, for one on
 *  its own; `inside` lays it on the control's own inner edge, for a member of a
 *  container whose members abut or that clips them. */
export type RingPlacement = 'outside' | 'inside';

/** What a container says to the controls it holds: where their ring goes, and
 *  the corner a member without one of its own takes, already nested. */
export interface RingScopeValue {
  placement: RingPlacement;
  corner?: Radius;
}

const RING_OF: Readonly<Record<RingPlacement, RingToken>> = {
  outside: 'focusLift',
  inside: 'focusInside',
};

export const RingScopeContext = createContext<RingScopeValue | undefined>(undefined);

/** What the nearest `<RingScope>` says, if any. */
export function useRingScope(): RingScopeValue | undefined {
  return useContext(RingScopeContext);
}

/** The ring a placement draws. */
export function ringOf(placement: RingPlacement): RingToken {
  return RING_OF[placement];
}

/** How far a container keeps its members off its own edge, so a member's
 *  inside ring, and the fill under it, sit concentric with the container's
 *  corners instead of against its border. */
export const MEMBER_INSET = 4;
