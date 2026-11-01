import { useCallback, useMemo, useRef, useState } from 'react';
import { webDocument } from '#ui/lib/dom';
import { type CommandAction, type CommandItem, matchingActions, stepTo } from './command-list';

const NO_ACTIONS: readonly CommandAction[] = [];

/** The action panel's state: whether it is up, what it is filtered by, and which of
 *  the actions of `item` its cursor is on. The panel has a field of its own, so closing
 *  it gives the focus back to what held it. */
function useActionPanel(item: CommandItem | undefined) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const opener = useRef<HTMLElement | null>(null);

  const all = item?.actions ?? NO_ACTIONS;
  const shown = useMemo(() => matchingActions(all, query), [all, query]);
  const at = Math.min(cursor, Math.max(0, shown.length - 1));

  const reset = useCallback(() => {
    setQuery('');
    setCursor(0);
  }, []);

  return {
    open,
    query,
    shown,
    cursor: shown[at],
    available: all.length > 0,
    show: useCallback(() => {
      opener.current = (webDocument()?.activeElement as HTMLElement | null) ?? null;
      reset();
      setOpen(true);
    }, [reset]),
    hide: useCallback(() => {
      setOpen(false);
      opener.current?.focus();
    }, []),
    filter: useCallback((next: string) => {
      setQuery(next);
      setCursor(0);
    }, []),
    step: (rows: number) => setCursor((prev) => stepTo(prev, rows, shown.length)),
    point: (action: CommandAction) => {
      const row = shown.indexOf(action);
      if (row >= 0) setCursor(row);
    },
  };
}

export { useActionPanel };
