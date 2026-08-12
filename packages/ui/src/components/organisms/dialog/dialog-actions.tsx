// The panel's row of controls: one focus group, right-aligned, with the
// cancel/confirm pair written as a prop because its ORDER is policy rather than
// a caller's choice.

import { Children, type ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { styles } from '#ui/core';
import { FocusRegion } from '#ui/lib/focus-scope';

const s = styles({
  row: { row: true, align: 'center', justify: 'flex-end', gap: 12, mt: 8 },
  split: { row: true, align: 'center', justify: 'space-between', gap: 12, mt: 8 },
  end: { row: true, align: 'center', gap: 10 },
});

interface DialogActionsProps {
  /** Dismisses the panel. Drawn to the left of the confirm, and quiet. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** The panel's own action, drawn accent to the right of the cancel. A panel
   *  with nothing to confirm leaves it out and keeps its way out. */
  onConfirm?: () => void;
  /** Already resolved by the caller, so it can swap to "Saving...". */
  confirmLabel?: string;
  /** The confirm destroys something: it goes red rather than accent. The one
   *  spelling, shared with <ConfirmDialog> and `confirm()`. */
  destructive?: boolean;
  /** The confirm spins and both actions ignore presses while the work runs. */
  busy?: boolean;
  /** Disables the confirm alone: the way out stays open. */
  disabled?: boolean;
  /** Controls of your own. Alone they ARE the row; beside a cancel or a confirm
   *  they sit at the opposite edge, which is where a "Delete account" belongs. */
  children?: ReactNode;
}

/** The controls a panel offers, as one focus group. `<Dialog.Actions onCancel
 *  cancelLabel onConfirm confirmLabel />` is the standard footer, `destructive`
 *  turns the confirm red, and children are extra actions. Each control is
 *  drawn only where it was asked for, and a row holding none of them draws
 *  nothing: a panel whose only way out is to close grows no confirm. */
function Actions({
  onCancel,
  cancelLabel,
  onConfirm,
  confirmLabel,
  destructive = false,
  busy = false,
  disabled = false,
  children,
}: Readonly<DialogActionsProps>) {
  const cancel =
    onCancel && cancelLabel !== undefined ? (
      <Button variant="ghost" size="sm" label={cancelLabel} onPress={onCancel} disabled={busy} />
    ) : null;
  const accept =
    onConfirm && confirmLabel !== undefined ? (
      <Button
        variant={destructive ? 'danger' : 'primary'}
        size="sm"
        label={confirmLabel}
        onPress={onConfirm}
        loading={busy}
        disabled={disabled}
      />
    ) : null;
  const pair =
    cancel || accept ? (
      <>
        {cancel}
        {accept}
      </>
    ) : null;
  const extra = Children.toArray(children);
  if (!pair) return extra.length === 0 ? null : <FocusRegion style={s.row}>{extra}</FocusRegion>;
  if (extra.length === 0) return <FocusRegion style={s.row}>{pair}</FocusRegion>;
  return (
    <FocusRegion style={s.split}>
      <Box style={s.end}>{extra}</Box>
      <Box style={s.end}>{pair}</Box>
    </FocusRegion>
  );
}

export type { DialogActionsProps };
export { Actions };
