// App-wide confirm dialog as an imperative callable (react-call), replacing
// native `window.confirm` and one-off confirm modals. Call it and await the
// boolean: `if (await confirmDialog({ ... })) { ...proceed... }`. Its single
// root is mounted once at the app root (the web shell's `routes/__root.tsx`),
// so call sites — core pages and module pages alike — carry no open-state.

import { Button } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { createCallable } from 'react-call';
import { Modal } from './forms';

export interface ConfirmProps {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}

/** The callable. Mounted once via `<ConfirmDialog />`; opened with `.call(...)`. */
export const ConfirmDialog = createCallable<ConfirmProps, boolean>(
  ({ call, title, message, confirmLabel, cancelLabel, destructive }) => (
    <Modal title={title} onClose={() => call.end(false)}>
      {message ? <div className="mb-5 text-[13px] leading-relaxed text-dim">{message}</div> : null}
      <div className="flex justify-end gap-2.5">
        <Button variant="ghost" size="sm" label={cancelLabel} onPress={() => call.end(false)} />
        <Button
          variant={destructive ? 'danger' : 'primary'}
          size="sm"
          label={confirmLabel}
          onPress={() => call.end(true)}
        />
      </div>
    </Modal>
  ),
);

/** Await a yes/no confirmation. Resolves `true` when confirmed, `false` if the
 * dialog was dismissed. */
export const confirmDialog = (props: ConfirmProps): Promise<boolean> => ConfirmDialog.call(props);
