// <Command>: the search-and-jump overlay, driven by a keyboard cursor on the
// web and by the spatial navigator on a television.
//
// The rows arrive as DATA rather than as children (DESIGN.md §3, tests T2 and
// T5): the cursor is arithmetic over one flat order - which row is nth, where
// the nth row sits in the scroller - and there is no arrangement of nested
// children that keeps that true, nor any DOM to ask the way cmdk does.

import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { styles } from '#ui/core';
import { WEB } from '#ui/lib/platform';
import { useControllable } from '#ui/lib/use-controllable';
import { CommandContext, type CommandState } from './command-context';
import { useCommandKeys } from './command-keys';
import { type CommandItem, flatten, scrollTo, sectionsOf, stepTo } from './command-list';
import { Empty, Footer, Input, List } from './command-parts';

// A television moves the spatial navigator's own focus, and a second highlight
// following a keyboard it does not have would be a lie there.

// Wide enough for a row of prose and no wider: a palette that spans a desk
// makes the reader's eyes travel from the query to the results.
const SHEET = 640;
const MARGIN = 16;

interface CommandRootProps {
  /** Every row the palette can reach, in the order they should be listed with
   *  nothing typed. A query ranks them itself. */
  items: readonly CommandItem[];
  /** The id already open behind the palette, marked in the list. */
  selected?: string;
  onSelect: (item: CommandItem) => void;
  /** Escape, the scrim, and choosing a row all come through here. */
  onClose: () => void;
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (next: string) => void;
  /** `<Command.Input>`, `<Command.List>`, `<Command.Empty>` and
   *  `<Command.Footer>`, in the order they should be stacked. */
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
  onSelect,
  onClose,
  query: queryProp,
  defaultQuery = '',
  onQueryChange,
  children,
}: Readonly<CommandRootProps>) {
  const [query, setQueryValue] = useControllable(queryProp, defaultQuery, onQueryChange);
  const [cursor, setCursor] = useState(0);
  const sections = useMemo(() => sectionsOf(items, query), [items, query]);
  const flat = useMemo(() => flatten(sections), [sections]);
  const at = Math.min(cursor, Math.max(0, flat.length - 1));

  const choose = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      onSelect(item);
      onClose();
    },
    [onSelect, onClose],
  );

  useCommandKeys({
    onStep: (rows) => setCursor((prev) => stepTo(prev, rows, flat.length)),
    onChoose: () => choose(flat[at]),
    onClose,
  });

  const state = useMemo<CommandState>(
    () => ({
      shown: flat.length,
      total: items.length,
      query,
      sections,
      cursor: WEB ? flat[at]?.id : undefined,
      selected,
      setQuery: (next: string) => {
        setQueryValue(next);
        setCursor(0);
      },
      point: (item) => setCursor(flat.indexOf(item)),
      choose,
      close: onClose,
      scroll: (offset, viewport) => scrollTo(sections, at, offset, viewport),
    }),
    [flat, items.length, query, sections, at, selected, setQueryValue, choose, onClose],
  );

  return (
    <CommandContext.Provider value={state}>
      <Box absolute top={0} right={0} bottom={0} left={0} z={40} align="center" style={s.scrim}>
        {/* The catcher fills the layer BEHIND the sheet rather than under it as
            a sibling in flow: without the inset box and the sheet's own `z`,
            it takes every press meant for a row and the palette closes on a
            click instead of opening what was clicked. */}
        <Focusable
          label="Close search"
          ring={false}
          onPress={onClose}
          style={s.catcher}
          focusScale={1}
        />
        <Box
          z={1}
          w={SHEET}
          maxW="100%"
          mx={MARGIN}
          mt={96}
          bg="surface2"
          radius="lg"
          border="borderStrong"
          borderWidth={1}
          shadow="pop"
          overflow="hidden"
        >
          {children}
        </Box>
      </Box>
    </CommandContext.Provider>
  );
}

const s = styles({
  scrim: { bg: 'bg/72' },
  // Absolute rather than `flex: 1`: a flex sibling would push the sheet down
  // the column, and the catcher has to sit UNDER the whole layer.
  catcher: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});

/**
 * A search-and-jump overlay: one field, a ranked and grouped list, a cursor the
 * arrows and the pointer share, and Enter to open.
 */
const Command = { Root, Input, List, Empty, Footer };

export type { CommandRootProps };
export { Command };
