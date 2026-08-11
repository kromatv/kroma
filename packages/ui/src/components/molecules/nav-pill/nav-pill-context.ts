// What <NavPill>'s parts share: the size and the label policy the Root settled
// on, and the two registers an item joins - the lens's (who owns it) and the
// slide's (what a finger can land on).

import { createContext, useContext } from 'react';

type NavPillSize = 'sm' | 'tv';

/** Which items show their label. Left unset it is the size's own policy: every
 *  label at `tv`, the active item's at `sm`. */
type NavPillLabels = 'all' | 'active' | 'none';

// The item's WHOLE box, measured: `onLayout` reports the content box while an
// absolute child is placed against the padding box, so a derived height misses.
interface LensRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SlideTarget {
  label: string;
  rect: () => LensRect | null;
  select: () => void;
}

interface NavPillState {
  size: NavPillSize;
  labels: NavPillLabels;
  claim: (id: string, rect: LensRect) => void;
  release: (id: string) => void;
  enrol: (id: string, target: SlideTarget) => void;
  withdraw: (id: string) => void;
  hover: string | null;
}

const NavPillContext = createContext<NavPillState | null>(null);

function useNavPill(part: string): NavPillState {
  const state = useContext(NavPillContext);
  if (!state) throw new Error(`<NavPill.${part}> must be used inside <NavPill.Root>`);
  return state;
}

export type { LensRect, NavPillLabels, NavPillSize, NavPillState, SlideTarget };
export { NavPillContext, useNavPill };
