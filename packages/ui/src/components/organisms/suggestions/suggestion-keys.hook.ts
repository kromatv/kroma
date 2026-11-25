import { useState } from 'react';
import { armEscapeGuard } from '#ui/lib/escape-guard';
import { useStableCallback } from '#ui/lib/stable-callback.hook';

interface RowAt {
  key: string;
  disabled: boolean;
}

/** Why the entry's keys open or close the list. */
type KeyReason = 'trigger' | 'escape' | 'outside';

/** A key the entry takes over, given where the list is; true when it acted. */
type EntryKey = (at: KeyAt) => boolean;

interface SuggestionKeysAt {
  query: string;
  setOpen: (open: boolean, why: KeyReason) => boolean;
  rows: readonly RowAt[];
  drawn: boolean;
  commit: (index: number) => boolean;
  keys?: Readonly<Record<string, EntryKey>>;
}

interface EntryKeyEvent {
  nativeEvent: { key: string };
  preventDefault: () => void;
}

interface SuggestionKeys {
  active: number;
  setActive: (index: number) => void;
  onKeyPress: (event: EntryKeyEvent) => void;
  commit: (index: number) => boolean;
}

interface KeyAt extends SuggestionKeysAt {
  active: number;
  move: (delta: -1 | 1) => boolean;
}

const KEYS: Readonly<Record<string, EntryKey>> = {
  ArrowDown: (at) => (at.drawn ? at.move(1) : at.setOpen(true, 'trigger') || true),
  ArrowUp: (at) => at.drawn && at.move(-1),
  Enter: (at) => at.commit(at.active) || true,
  Escape: (at) => {
    if (!at.drawn) {
      return false;
    }
    armEscapeGuard();
    return at.setOpen(false, 'escape') || true;
  },
  Tab: (at) => {
    at.setOpen(false, 'outside');
    return false;
  },
};

function step(rows: readonly RowAt[], from: number, delta: -1 | 1): number {
  for (let at = from + delta; at < rows.length; at += delta) {
    if (at < 0) {
      return -1;
    }
    if (!rows[at]?.disabled) {
      return at;
    }
  }
  return from;
}

function firstRow(rows: readonly RowAt[], query: string): number {
  return query.trim() === '' ? -1 : rows.findIndex((row) => !row.disabled);
}

/** The entry's keyboard over the list under it. Once something is typed the
 *  first row is active; arrows walk the rows, and Up from the first lets go of
 *  them. Enter commits the active row, Esc closes, and `keys` adds the field's
 *  own. A row the arrows reached is held by its key, so a suggestion arriving
 *  late does not move it. */
function useSuggestionKeys(at: SuggestionKeysAt): SuggestionKeys {
  const { query, rows } = at;
  const [held, setHeld] = useState<{ query: string; key: string | null }>({ query, key: null });
  const active =
    held.query === query ? rows.findIndex((row) => row.key === held.key) : firstRow(rows, query);
  const setActive = useStableCallback((index: number) => {
    setHeld({ query, key: rows[index]?.key ?? null });
  });
  const move = (delta: -1 | 1) => {
    setActive(step(rows, active, delta));
    return true;
  };
  const onKeyPress = (event: EntryKeyEvent) => {
    const name = event.nativeEvent.key;
    const handle = at.keys?.[name] ?? KEYS[name];
    if (handle?.({ ...at, active, move })) {
      event.preventDefault();
    }
  };
  return { active, setActive, onKeyPress, commit: at.commit };
}

export type { EntryKey, KeyReason, SuggestionKeys };
export { useSuggestionKeys };
