// What <Menu>'s parts share: the Root's state, and the per-row plumbing the
// open surface hands each <Menu.Item>.

import { createContext, type RefObject, useContext } from 'react';
import type { View } from 'react-native';
import { type ChangeDetails, type ControlOf, defineControl, type ReasonOf } from '#ui/lib/control';
import { partContext } from '#ui/lib/part-context';

const menuControl = defineControl('menu', {
  state: { open: false },
  actions: { trigger: () => ({ open: true }) },
  reasons: ['select', 'outside', 'escape', 'back'],
});

/** Why the menu opened or closed. `set` is a setter called without a reason,
 *  which is what a developer tool's call carries. */
type MenuOpenReason = ReasonOf<typeof menuControl>;

/** Why the menu closed. `back` is the remote's Back button (and, in a browser
 *  TV shell, the key it arrives as). */
type MenuDismissReason = Exclude<MenuOpenReason, 'trigger' | 'set'>;

type MenuOpenDetails = ChangeDetails<MenuOpenReason>;

type MenuState = Pick<ControlOf<typeof menuControl>, 'open' | 'setOpen' | 'trigger'> & {
  label: string | undefined;
  anchor: RefObject<View | null>;
};

const [MenuContext, useMenu] = partContext<MenuState>('Menu.Root');

interface MenuRowState {
  presentation: 'panel' | 'dialog';
  nativeID?: string;
  active: boolean;
  entry?: boolean;
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
  if (!state) {
    throw new Error(`<Menu.${part}> must be a direct child of <Menu.Root>`);
  }
  return state;
}

export type { MenuDismissReason, MenuOpenDetails, MenuOpenReason, MenuRowState, MenuState };
export { MenuContext, MenuRowContext, menuControl, useMenu, useMenuRow };
