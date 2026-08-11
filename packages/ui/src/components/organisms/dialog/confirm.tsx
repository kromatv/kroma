// The imperative confirm, the same shape as `toast()`: one <ConfirmHost/> is
// mounted by the shell, and anything, anywhere, awaits `confirm(...)` for a
// boolean - no open-state at the call site, no one-off confirm modals.

import { useEffect, useState } from 'react';
import { ConfirmDialog } from './dialog-actions';

export interface ConfirmOptions {
  title: string;
  /** Already translated - the kit does not know your catalog. */
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}

interface Ask extends ConfirmOptions {
  id: number;
  resolve: (answer: boolean) => void;
}

let accept: ((ask: Ask) => void) | null = null;
let nextId = 1;

/**
 * Ask a yes/no question. Resolves `true` on confirm, `false` when dismissed -
 * and immediately `false` when no <ConfirmHost/> is mounted, so a shell that
 * has not opted in fails closed instead of hanging the caller forever.
 */
export function confirm(options: Readonly<ConfirmOptions>): Promise<boolean> {
  const take = accept;
  if (!take) return Promise.resolve(false);
  return new Promise((resolve) => take({ id: nextId++, ...options, resolve }));
}

/** Mount once, near the root. Draws whatever `confirm()` asks, one at a time. */
export function ConfirmHost() {
  const [queue, setQueue] = useState<Ask[]>([]);

  useEffect(() => {
    accept = (ask) => setQueue((pending) => [...pending, ask]);
    return () => {
      accept = null;
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  const answer = (value: boolean) => {
    current.resolve(value);
    setQueue((pending) => pending.slice(1));
  };

  return (
    <ConfirmDialog
      open
      width={520}
      title={current.title}
      description={current.message}
      confirmLabel={current.confirmLabel}
      cancelLabel={current.cancelLabel}
      destructive={current.destructive}
      onClose={() => answer(false)}
      onConfirm={() => answer(true)}
    />
  );
}
