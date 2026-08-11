// The D-pad presentation of <Select>'s options: a <Dialog>, which on tvOS is
// its own view controller - the remote is confined to the options, and a
// popover anchored to the trigger would be clipped inside a ScrollView.

import { Dialog } from '#ui/components/organisms/dialog';
import { FocusColumn } from '#ui/lib/focus-scope';
import { pointerDriving } from '#ui/lib/input-source';
import { DIALOG_ROW, type SelectDismissReason, SelectRowContext } from './select-context';
import type { SelectSurfaceProps } from './select-surface';

// The dialog's two ways out, and it is handed neither: the backdrop belongs to
// a pointer, and everything else here is Back - a remote's button, a phone's
// system gesture, the key a browser TV shell sends.
function dismissReason(): SelectDismissReason {
  return pointerDriving() ? 'outside' : 'back';
}

function SelectOptionsDialog({ open, onDismiss, label, items }: Readonly<SelectSurfaceProps>) {
  return (
    <Dialog open={open} onClose={() => onDismiss(dismissReason())} title={label} width={560}>
      <FocusColumn>
        {items.map((item) => (
          <SelectRowContext.Provider key={item.key} value={DIALOG_ROW}>
            {item}
          </SelectRowContext.Provider>
        ))}
      </FocusColumn>
    </Dialog>
  );
}

export { SelectOptionsDialog };
