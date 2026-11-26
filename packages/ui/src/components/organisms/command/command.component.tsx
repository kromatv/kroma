// <Command>: the search-and-jump overlay, driven by a keyboard cursor on the
// web and by the spatial navigator on a television.
//
// The rows arrive as DATA rather than as children (DESIGN.md §3, tests T2 and
// T5): the cursor is arithmetic over one flat order - which row is nth, where
// the nth row sits in the scroller - and there is no arrangement of nested
// children that keeps that true, nor any DOM to ask the way cmdk does.

import { type ReactNode, useMemo } from 'react';
import { type ChangeDetails, defineControl, useControl } from '#ui/lib/control';
import { useDeliberateHover } from '#ui/lib/deliberate-hover.hook';
import { Actions, Primary, Trigger } from './command-actions.component';
import { CommandContext, type CommandState } from './command-context.hook';
import { CommandLayer, CommandModal } from './command-layer.component';
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
import { useActionPanel } from './use-action-panel.hook';
import { useCommandChoice } from './use-command-choice.hook';
import { useCommandPages } from './use-command-pages.hook';
import { leave, usePaletteKeys } from './use-palette-keys.hook';
import { useQueryCursor } from './use-query-cursor.hook';

const commandControl = defineControl('command', { state: { query: '' } });

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
  /** Told before the query changes; `details.cancel()` keeps it as it was. */
  onQueryChange?: (next: string, details: ChangeDetails) => void;
  /** Draw over the whole window, holding the focus and the page's scroll, rather
   *  than over the nearest positioned ancestor. */
  modal?: boolean;
  /** The accessible name of the scrim, which closes the palette. */
  closeLabel?: string;
  /** The accessible name of what goes back out of a row's own list. */
  backLabel?: string;
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
  modal = false,
  closeLabel = 'Close search',
  backLabel = 'Back',
  children,
  ...props
}: Readonly<CommandRootProps>) {
  const [{ query, setQuery }] = useControl(commandControl, props);
  const pages = useCommandPages({ items, query, setQuery });
  const [cursor, setCursor] = useQueryCursor(pages.scope, pages.start);
  const sections = useMemo(
    () => sectionsOf(pages.listed, query, boost),
    [pages.listed, query, boost],
  );
  const flat = useMemo(() => flatten(sections), [sections]);
  const at = Math.min(cursor, Math.max(0, flat.length - 1));

  const current = flat[at];
  const actions = useActionPanel(current);
  const { choose, chooseAction, chooseSecondary } = useCommandChoice({
    current,
    at,
    actions,
    pages,
    onSelect,
    onClose,
  });

  // Stable, because it is a prop on every row: rebuilt with the rest of the
  // context it would re-render the whole list on a keystroke that only moved
  // the cursor.
  const point = useDeliberateHover((item: CommandItem) => {
    const row = flat.indexOf(item);
    if (row >= 0) {
      setCursor(row);
    }
  });

  const cursorId = usePaletteKeys({
    current,
    actions,
    pages,
    step: (rows) => setCursor((prev) => stepTo(prev, rows, flat.length)),
    choose,
    chooseAction,
    chooseSecondary,
    onClose,
    modal,
  });

  const state = useMemo<CommandState>(
    () => ({
      shown: flat.length,
      total: pages.listed.length,
      query,
      current,
      sections,
      cursor: cursorId,
      selected,
      page: pages.page,
      back: pages.back,
      backLabel,
      setQuery,
      point,
      choose,
      chooseAction,
      actions,
      close: onClose,
      scroll: (offset, viewport) => scrollTo(sections, at, offset, viewport),
    }),
    [
      flat.length,
      pages.listed.length,
      query,
      current,
      sections,
      cursorId,
      selected,
      pages.page,
      pages.back,
      backLabel,
      setQuery,
      point,
      choose,
      chooseAction,
      actions,
      onClose,
      at,
    ],
  );

  const palette = (
    <CommandContext value={state}>
      <CommandLayer closeLabel={closeLabel} onClose={onClose} animated={modal}>
        {children}
      </CommandLayer>
    </CommandContext>
  );
  return modal ? <CommandModal onClose={leave(pages, onClose)}>{palette}</CommandModal> : palette;
}

/**
 * A search-and-jump overlay: one field, a list a query ranks, a cursor the
 * arrows and the pointer share, Enter to open, and an action panel for everything
 * else a row can do.
 */
const Command = { Root, Input, List, Empty, Footer, Primary, Trigger, Actions };

export type { CommandRootProps };
export { Command };
