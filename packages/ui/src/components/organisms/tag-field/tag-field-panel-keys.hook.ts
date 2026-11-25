import { useState } from 'react';
import { armEscapeGuard } from '#ui/lib/escape-guard';
import { useStableCallback } from '#ui/lib/stable-callback.hook';
import type { TagFieldControl } from './tag-field-context';

interface PanelRowAt {
  key: string;
  disabled: boolean;
}

interface PanelKeysAt {
  control: TagFieldControl;
  rows: readonly PanelRowAt[];
  drawn: boolean;
  commit: (index: number) => boolean;
}

interface EntryKeyEvent {
  nativeEvent: { key: string };
  preventDefault: () => void;
}

interface PanelKeys {
  active: number;
  setActive: (index: number) => void;
  onKeyPress: (event: EntryKeyEvent) => void;
  commit: (index: number) => boolean;
}

interface KeyAt extends PanelKeysAt {
  active: number;
  move: (delta: -1 | 1) => boolean;
}

const KEYS: Readonly<Record<string, (at: KeyAt) => boolean>> = {
  ArrowDown: (at) => (at.drawn ? at.move(1) : at.control.setOpen(true, 'trigger') || true),
  ArrowUp: (at) => at.drawn && at.move(-1),
  Enter: (at) => at.commit(at.active) || true,
  Escape: (at) => {
    if (!at.drawn) {
      return false;
    }
    armEscapeGuard();
    return at.control.setOpen(false, 'escape') || true;
  },
  Tab: (at) => {
    at.control.setOpen(false, 'outside');
    return false;
  },
  Backspace: (at) => {
    const last = at.control.value.at(-1);
    return at.control.query === '' && last !== undefined && at.control.remove(last);
  },
};

function step(rows: readonly PanelRowAt[], from: number, delta: -1 | 1): number {
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

function firstRow(rows: readonly PanelRowAt[], query: string): number {
  return query.trim() === '' ? -1 : rows.findIndex((row) => !row.disabled);
}

/** The entry's keyboard over the list under it. Once something is typed the
 *  first row is active; arrows walk the rows, and Up from the first lets go of
 *  them. Enter adds the active row, or what is typed. Esc closes, Backspace in
 *  an empty entry takes the last tag out. A row the arrows reached is held by
 *  its key, so a suggestion arriving late does not move it. */
export function usePanelKeys(at: PanelKeysAt): PanelKeys {
  const { control, rows } = at;
  const [held, setHeld] = useState<{ query: string; key: string | null }>({
    query: control.query,
    key: null,
  });
  const active =
    held.query === control.query
      ? rows.findIndex((row) => row.key === held.key)
      : firstRow(rows, control.query);
  const setActive = useStableCallback((index: number) => {
    setHeld({ query: control.query, key: rows[index]?.key ?? null });
  });
  const move = (delta: -1 | 1) => {
    setActive(step(rows, active, delta));
    return true;
  };
  const onKeyPress = (event: EntryKeyEvent) => {
    if (KEYS[event.nativeEvent.key]?.({ ...at, active, move })) {
      event.preventDefault();
    }
  };
  return { active, setActive, onKeyPress, commit: at.commit };
}

export type { PanelKeys };
