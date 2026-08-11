// The D-pad presentation of <Menu>'s items: a <Dialog>, for the same reason
// <Select> uses one (the remote is confined to the options).

import type { ReactElement, RefObject } from 'react';
import type { View } from 'react-native';
import { Dialog } from '#ui/components/organisms/dialog';
import { FocusColumn } from '#ui/lib/focus-scope';
import { pointerDriving } from '#ui/lib/input-source';
import { type MenuDismissReason, MenuRowContext } from './menu-context';

/** One actionable row, in the order the items were written. `at` is the
 *  position among the ENTRIES, which count the separators too. */
export interface MenuRowSpec {
  at: number;
  label: string;
  disabled: boolean;
  select: () => void;
}

export interface MenuSurfaceProps {
  open: boolean;
  label: string | undefined;
  /** The <Menu.Item> and <Menu.Separator> elements, in order. */
  entries: readonly ReactElement[];
  rows: readonly MenuRowSpec[];
  align: 'start' | 'end';
  onDismiss: (reason: MenuDismissReason) => void;
  anchor: RefObject<View | null>;
}

// The dialog's two ways out, and it is handed neither: the backdrop belongs to
// a pointer, and everything else here is Back - a remote's button, a phone's
// system gesture, the key a browser TV shell sends.
function dismissReason(): MenuDismissReason {
  return pointerDriving() ? 'outside' : 'back';
}

export function MenuSurfaceDialog({
  open,
  onDismiss,
  label,
  entries,
  rows,
}: Readonly<MenuSurfaceProps>) {
  const fire = (spec: MenuRowSpec) => {
    if (spec.disabled) return;
    onDismiss('select');
    spec.select();
  };
  return (
    <Dialog open={open} onClose={() => onDismiss(dismissReason())} title={label} width={480}>
      <FocusColumn>
        {entries.map((entry, at) => {
          const spec = rows.find((row) => row.at === at);
          return (
            <MenuRowContext.Provider
              key={entry.key}
              value={{
                presentation: 'dialog',
                active: false,
                fire: () => {
                  if (spec) fire(spec);
                },
              }}
            >
              {entry}
            </MenuRowContext.Provider>
          );
        })}
      </FocusColumn>
    </Dialog>
  );
}
