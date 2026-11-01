// <Command>: the search-and-jump overlay, driven by a keyboard cursor on the
// web and by the spatial navigator on a television.
//
// The rows arrive as DATA rather than as children (DESIGN.md §3, tests T2 and
// T5): the cursor is arithmetic over one flat order - which row is nth, where
// the nth row sits in the scroller - and there is no arrangement of nested
// children that keeps that true, nor any DOM to ask the way cmdk does.

import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useCommandKey } from '#ui/lib/command-key';
import { useDeliberateHover } from '#ui/lib/deliberate-hover';
import { useListCursorKeys } from '#ui/lib/list-cursor-keys';
import { useControllable } from '#ui/lib/use-controllable';
import { Actions, Primary, Trigger } from './command-actions';
import { CommandContext, type CommandState } from './command-context';
import { CommandLayer, CommandModal } from './command-layer';
import {
  type CommandAction,
  type CommandBoost,
  type CommandItem,
  flatten,
  scrollTo,
  sectionsOf,
  stepTo,
} from './command-list';
import { Empty, Footer, Input, List } from './command-parts';
import { useActionPanel } from './use-action-panel';

// A television moves the spatial navigator's own focus, and a second highlight
// following a keyboard it does not have would be a lie there.

interface CommandRootProps {
  /** Every row the palette can reach, in the order they should be listed with
   *  nothing typed. A query ranks them itself. */
  items: readonly CommandItem[];
  /** The id already open behind the palette, marked in the list. */
  selected?: string;
  /** What to add to a row's score for a query, such as what the viewer chose before. */
  boost?: CommandBoost;
  /** A row was chosen. `action` is which of its actions, when it has any. */
  onSelect: (item: CommandItem, action?: CommandAction) => void;
  /** Escape, the scrim, and choosing a row all come through here. */
  onClose: () => void;
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (next: string) => void;
  /** Draw over the whole window, holding the focus and the page's scroll, rather
   *  than over the nearest positioned ancestor. */
  modal?: boolean;
  /** The accessible name of the scrim, which closes the palette. */
  closeLabel?: string;
  /** `<Command.Input>`, `<Command.List>`, `<Command.Empty>`, `<Command.Footer>` and
   *  `<Command.Actions>`, in the order they should be stacked. */
  children?: ReactNode;
}

/**
 * The palette. Render it while it is open and unmount it to close; it takes the
 * keyboard for as long as it is up.
 *
 * ```tsx
 * <Command.Root items={rows} selected={open} onSelect={go} onClose={shut}>
 *   <Command.Input placeholder="Search…" label="Search the library" />
 *   <Command.List />
 *   <Command.Empty>Nothing found.</Command.Empty>
 * </Command.Root>
 * ```
 */
function Root({
  items,
  selected,
  boost,
  onSelect,
  onClose,
  query: queryProp,
  defaultQuery = '',
  onQueryChange,
  modal = false,
  closeLabel = 'Close search',
  children,
}: Readonly<CommandRootProps>) {
  const [query, setQueryValue] = useControllable(queryProp, defaultQuery, onQueryChange);
  const [cursor, setCursor] = useState(0);
  const sections = useMemo(() => sectionsOf(items, query, boost), [items, query, boost]);
  const flat = useMemo(() => flatten(sections), [sections]);
  const at = Math.min(cursor, Math.max(0, flat.length - 1));

  const current = flat[at];
  const actions = useActionPanel(current);

  const run = useCallback(
    (item: CommandItem, action: CommandAction | undefined) => {
      onSelect(item, action);
      onClose();
    },
    [onSelect, onClose],
  );

  const choose = useCallback(
    (item: CommandItem | undefined) => {
      if (item) run(item, item.actions?.[0]);
    },
    [run],
  );

  const chooseAction = (action: CommandAction) => {
    if (current) run(current, action);
  };

  const chooseSecondary = () => {
    const second = current?.actions?.[1];
    if (current && second) run(current, second);
  };

  // Stable, because it is a prop on every row: rebuilt with the rest of the
  // context it would re-render the whole list on a keystroke that only moved
  // the cursor.
  const point = useDeliberateHover((item: CommandItem) => {
    const row = flat.indexOf(item);
    if (row >= 0) setCursor(row);
  });

  const cursorId = useListCursorKeys({
    cursor: current?.id,
    onStep: (rows) =>
      actions.open ? actions.step(rows) : setCursor((prev) => stepTo(prev, rows, flat.length)),
    onChoose: (secondary) => {
      if (actions.open) {
        if (actions.cursor) chooseAction(actions.cursor);
      } else if (secondary) chooseSecondary();
      else choose(current);
    },
    onClose: actions.open ? actions.hide : onClose,
  });

  useCommandKey(() => {
    if (actions.open) actions.hide();
    else if (actions.available) actions.show();
    else onClose();
  }, modal);

  const state: CommandState = {
    shown: flat.length,
    total: items.length,
    query,
    current,
    sections,
    cursor: cursorId,
    selected,
    setQuery: (next: string) => {
      setQueryValue(next);
      setCursor(0);
    },
    point,
    choose,
    chooseAction,
    actions,
    close: onClose,
    scroll: (offset, viewport) => scrollTo(sections, at, offset, viewport),
  };

  const palette = (
    <CommandContext.Provider value={state}>
      <CommandLayer closeLabel={closeLabel} onClose={onClose} animated={modal}>
        {children}
      </CommandLayer>
    </CommandContext.Provider>
  );
  return modal ? <CommandModal onClose={onClose}>{palette}</CommandModal> : palette;
}

/**
 * A search-and-jump overlay: one field, a list a query ranks, a cursor the
 * arrows and the pointer share, Enter to open, and an action panel for everything
 * else a row can do.
 */
const Command = { Root, Input, List, Empty, Footer, Primary, Trigger, Actions };

export type { CommandRootProps };
export { Command };
