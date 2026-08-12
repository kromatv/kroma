// The D-pad presentation of <Menu>'s items: a <Dialog>, for the same reason
// <Select> uses one (the remote is confined to the options).

import { type ReactElement, type RefObject, useCallback, useMemo } from 'react';
import type { View } from 'react-native';
import { Dialog } from '#ui/components/organisms/dialog';
import { FocusColumn } from '#ui/lib/focus-scope';
import { pointerDriving } from '#ui/lib/input-source';
import { type MenuDismissReason, MenuRowContext, type MenuRowState } from './menu-context';

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

interface DialogEntryProps {
  entry: ReactElement;
  spec: MenuRowSpec | undefined;
  onFire: (spec: MenuRowSpec) => void;
}

function DialogEntry({ entry, spec, onFire }: Readonly<DialogEntryProps>) {
  const row = useMemo<MenuRowState>(
    () => ({
      presentation: 'dialog',
      active: false,
      fire: () => {
        if (spec) onFire(spec);
      },
    }),
    [spec, onFire],
  );
  return <MenuRowContext.Provider value={row}>{entry}</MenuRowContext.Provider>;
}

export function MenuSurfaceDialog({
  open,
  onDismiss,
  label,
  entries,
  rows,
}: Readonly<MenuSurfaceProps>) {
  const fire = useCallback(
    (spec: MenuRowSpec) => {
      if (spec.disabled) return;
      onDismiss('select');
      spec.select();
    },
    [onDismiss],
  );
  return (
    <Dialog.Root open={open} onClose={() => onDismiss(dismissReason())} title={label} width="sm">
      <FocusColumn>
        {entries.map((entry, at) => (
          <DialogEntry
            key={entry.key}
            entry={entry}
            spec={rows.find((row) => row.at === at)}
            onFire={fire}
          />
        ))}
      </FocusColumn>
    </Dialog.Root>
  );
}
