// What <Menu>'s parts share: the Root's state, and the per-row plumbing the
// open surface hands each <Menu.Item>.

import type { RefObject } from 'react';
import { createContext, useContext } from 'react';
import type { View } from 'react-native';

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

const MenuContext = createContext<MenuState | null>(null);

function useMenu(part: string): MenuState {
  const state = useContext(MenuContext);
  if (!state) throw new Error(`<Menu.${part}> must be used inside <Menu.Root>`);
  return state;
}

interface MenuRowState {
  presentation: 'panel' | 'dialog';
  nativeID?: string;
  active: boolean;
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
