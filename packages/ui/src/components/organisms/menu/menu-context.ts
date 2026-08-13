// What <Menu>'s parts share: the Root's state, and the per-row plumbing the
// open surface hands each <Menu.Item>.

import { createContext, type RefObject, useContext } from 'react';
import type { View } from 'react-native';
import { partContext } from '#ui/lib/part-context';

/** Why the menu closed. `back` is the remote's Back button (and, in a browser
 *  TV shell, the key it arrives as). */
type MenuDismissReason = 'select' | 'outside' | 'escape' | 'back';

type MenuOpenReason = 'trigger' | MenuDismissReason;

interface MenuOpenDetails {
  reason: MenuOpenReason;
}

interface MenuState {
  open: boolean;
  label: string | undefined;
  anchor: RefObject<View | null>;
  setOpen: (open: boolean, reason: MenuOpenReason) => void;
}

const [MenuContext, useMenu] = partContext<MenuState>('Menu.Root');

interface MenuRowState {
  presentation: 'panel' | 'dialog';
  nativeID?: string;
  active: boolean;
  /** Whether the keys put the highlight here rather than a cursor sweeping
   *  past: the ring is the keyboard's, the wash is the pointer's. */
  keyed?: boolean;
  onHoverIn?: () => void;
  /** Closes the menu and runs the item's `onSelect`, in that order. The
   *  keyboard fires the same one. */
  fire: () => void;
}

const MenuRowContext = createContext<MenuRowState | null>(null);

function useMenuRow(part: string): MenuRowState {
  const state = useContext(MenuRowContext);
  if (!state) throw new Error(`<Menu.${part}> must be a direct child of <Menu.Root>`);
  return state;
}

export type { MenuDismissReason, MenuOpenDetails, MenuOpenReason, MenuRowState, MenuState };
export { MenuContext, MenuRowContext, useMenu, useMenuRow };
