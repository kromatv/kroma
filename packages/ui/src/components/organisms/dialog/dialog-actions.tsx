// What a panel puts at the bottom: the footer row, the standard action pair,
// and the whole confirmation dialog those two add up to.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { styles } from '#ui/core';
import { FocusRegion } from '#ui/lib/focus-scope';
import { Dialog, type DialogProps } from './dialog';

const s = styles({
  footerRow: { row: true, justify: 'flex-end', gap: 12, mt: 8 },
  actionsSplit: { row: true, align: 'center', justify: 'space-between', gap: 12, mt: 8 },
  actionsEnd: { row: true, align: 'center', gap: 10 },
});

function DialogFooter({ children }: Readonly<{ children: ReactNode }>) {
  return <FocusRegion style={s.footerRow}>{children}</FocusRegion>;
}

interface DialogActionsProps {
  onCancel: () => void;
  cancelLabel: string;
  onConfirm: () => void;
  /** Already resolved by the caller, so it can swap to "Saving...". */
  confirmLabel: string;
  /** The confirm spins and both actions ignore presses while the work runs. */
  busy?: boolean;
  disabled?: boolean;
  /** A destructive third action pinned to the far edge ("Delete account"). */
  destructive?: { label: string; onPress: () => void; disabled?: boolean };
}

/** The standard dialog footer: a right-aligned cancel + primary pair, with an
 *  optional destructive action pinned left. */
function DialogActions({
  onCancel,
  cancelLabel,
  onConfirm,
  confirmLabel,
  busy = false,
  disabled = false,
  destructive,
}: Readonly<DialogActionsProps>) {
  return (
    <FocusRegion style={destructive ? s.actionsSplit : s.footerRow}>
      {destructive ? (
        <Button
          variant="dangerGhost"
          size="sm"
          label={destructive.label}
          onPress={destructive.onPress}
          disabled={busy || destructive.disabled}
        />
      ) : null}
      <Box row align="center" gap={10} style={destructive ? undefined : s.actionsEnd}>
        <Button variant="ghost" size="sm" label={cancelLabel} onPress={onCancel} disabled={busy} />
        <Button
          variant="primary"
          size="sm"
          label={confirmLabel}
          onPress={onConfirm}
          loading={busy}
          disabled={disabled}
        />
      </Box>
    </FocusRegion>
  );
}

interface ConfirmDialogProps extends Omit<DialogProps, 'footer' | 'children'> {
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}

function ConfirmDialog({
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  ...dialog
}: Readonly<ConfirmDialogProps>) {
  return (
    <Dialog
      {...dialog}
      footer={
        <DialogFooter>
          <Button variant="ghost" label={cancelLabel} onPress={dialog.onClose} />
          <Button
            variant={destructive ? 'danger' : 'primary'}
            label={confirmLabel}
            onPress={onConfirm}
            autoFocus
          />
        </DialogFooter>
      }
    />
  );
}

export type { ConfirmDialogProps, DialogActionsProps };
export { ConfirmDialog, DialogActions, DialogFooter };
