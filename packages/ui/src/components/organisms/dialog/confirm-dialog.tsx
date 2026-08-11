import { Button } from '#ui/components/atoms/button';
import { Dialog, type DialogProps } from './dialog';

interface ConfirmDialogProps extends Omit<DialogProps, 'footer' | 'children'> {
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}

/** A whole yes/no panel: a question, and a pair of full-size buttons with the
 *  ring already on the answer. `confirm()` is the imperative way to raise one. */
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
        <Dialog.Actions>
          <Button variant="ghost" label={cancelLabel} onPress={dialog.onClose} />
          <Button
            variant={destructive ? 'danger' : 'primary'}
            label={confirmLabel}
            onPress={onConfirm}
            autoFocus
          />
        </Dialog.Actions>
      }
    />
  );
}

export type { ConfirmDialogProps };
export { ConfirmDialog };
