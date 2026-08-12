import { Button } from '#ui/components/atoms/button';
import { Dialog, type DialogRootProps } from '../dialog';

interface ConfirmDialogProps extends Omit<DialogRootProps, 'children'> {
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
    <Dialog.Root {...dialog}>
      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={cancelLabel} onPress={dialog.onClose} />
          <Button
            variant={destructive ? 'danger' : 'primary'}
            label={confirmLabel}
            onPress={onConfirm}
            autoFocus
          />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
}

export type { ConfirmDialogProps };
export { ConfirmDialog };
