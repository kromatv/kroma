import { useEffect, useState } from 'react';
import { pointerDriving } from '#ui/lib/input-source';

/**
 * Whether the current focus is one the viewer asked for, in the browser's
 * `:focus-visible` sense — true for keys and the remote, false for a cursor that
 * merely swept past.
 *
 * The spatial navigator focuses on mouse-enter once a pointer has moved and
 * never blurs on leave, because its model keeps exactly one focus owner. Without
 * this the amber ring parks on whatever the cursor passed last.
 *
 * `focus` identifies WHAT holds the focus, not merely that something does: a
 * cluster whose selection moves between its own controls has to re-read the
 * modality on every move, so passing a boolean there would answer for the first
 * control and never again. A boolean is right where the control is its own
 * focus owner.
 *
 * `<Focusable>` applies this to its ring and to a recipe's `_focus`. Anything
 * resolving a recipe directly — a control whose focus visuals live on a parent,
 * or on a `<Box>` that is not itself focusable — must ask here too, or `_focus`
 * would mean two different things depending on how it was reached.
 */
export function useFocusVisible(focus: unknown): boolean {
  const [visible, setVisible] = useState(() => !pointerDriving());
  useEffect(() => {
    if (focus !== false && focus != null) setVisible(!pointerDriving());
  }, [focus]);
  return focus !== false && focus != null && visible;
}
