// A confirmation queue belongs to the app root that draws its dialogs. Screens
// ask through useConfirm(), so two roots never send questions to each other.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ConfirmDialog } from './confirm-dialog';

export interface ConfirmOptions {
  title: string;
  /** Already translated - the kit does not know your catalog. */
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}

interface Ask extends ConfirmOptions {
  resolve: (answer: boolean) => void;
}

type Confirm = (options: Readonly<ConfirmOptions>) => Promise<boolean>;
const Context = createContext<Confirm>(() => Promise.resolve(false));

/** Ask this root a yes/no question; fail closed without a host. */
export function useConfirm(): Confirm {
  return useContext(Context);
}

/** Wrap the app/screens whose questions this host owns. */
export function ConfirmHost({ children }: Readonly<{ children?: ReactNode }>) {
  const [queue, setQueue] = useState<Ask[]>([]);
  const pending = useRef(new Set<(answer: boolean) => void>());
  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise((resolve) => {
        pending.current.add(resolve);
        setQueue((queue) => [...queue, { ...options, resolve }]);
      }),
    [],
  );

  useEffect(() => {
    const requests = pending.current;
    return () => {
      for (const resolve of requests) resolve(false);
      requests.clear();
    };
  }, []);

  const current = queue[0];
  const answer = (value: boolean) => {
    if (!current) return;
    pending.current.delete(current.resolve);
    current.resolve(value);
    setQueue((queue) => queue.slice(1));
  };

  return (
    <Context.Provider value={confirm}>
      {children}
      {current ? (
        <ConfirmDialog
          open
          width="sm"
          title={current.title}
          description={current.message}
          confirmLabel={current.confirmLabel}
          cancelLabel={current.cancelLabel}
          destructive={current.destructive}
          onClose={() => answer(false)}
          onConfirm={() => answer(true)}
        />
      ) : null}
    </Context.Provider>
  );
}
