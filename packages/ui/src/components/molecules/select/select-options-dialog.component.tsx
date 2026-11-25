// The D-pad presentation of <Select>'s options: a <Dialog>, which on tvOS is
// its own view controller - the remote is confined to the options, and a
// popover anchored to the trigger would be clipped inside a ScrollView.

import { Dialog } from '#ui/components/organisms/dialog';
import { FocusColumn } from '#ui/lib/focus-scope.component';
import { usePointerDriving } from '#ui/lib/input-source';
import {
  DIALOG_ROW,
  SelectContext,
  type SelectDismissReason,
  SelectRowContext,
  type SelectRowState,
  useSelect,
} from './select-context';
import type { SelectSurfaceProps } from './select-surface';

// The dialog's two ways out, and it is handed neither: the backdrop belongs to
// a pointer, and everything else here is Back - a remote's button, a phone's
// system gesture, the key a browser TV shell sends.
function dismissReason(pointerDriving: () => boolean): SelectDismissReason {
  return pointerDriving() ? 'outside' : 'back';
}

const ENTRY_ROW: SelectRowState = { ...DIALOG_ROW, autoFocus: true };

function SelectOptionsDialog(props: Readonly<SelectSurfaceProps>) {
  const { open, onDismiss, label, items, options, values } = props;
  const pointerDriving = usePointerDriving();
  const select = useSelect('Root');
  const entry = Math.max(
    0,
    options.findIndex((option) => values.includes(option.value)),
  );
  return (
    <Dialog.Root
      open={open}
      onClose={() => onDismiss(dismissReason(pointerDriving))}
      title={label}
      width="md"
    >
      <SelectContext value={select}>
        <FocusColumn>
          {items.map((item, index) => (
            <SelectRowContext key={item.key} value={index === entry ? ENTRY_ROW : DIALOG_ROW}>
              {item}
            </SelectRowContext>
          ))}
        </FocusColumn>
      </SelectContext>
    </Dialog.Root>
  );
}

export { SelectOptionsDialog };
