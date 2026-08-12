// What a palette publishes to its parts.
//
// The Root owns the query, the cursor and the list, because all three are one
// piece of state: typing resets the cursor, the cursor decides what Enter
// opens, and where the cursor is decides where the list has scrolled to.

import { partContext } from '#ui/lib/part-context';
import type { CommandItem, CommandSection } from './command-list';

/** What the palette is currently showing. */
interface CommandResults {
  /** Rows the query left. */
  shown: number;
  /** Rows there are in total. */
  total: number;
  query: string;
}

interface CommandState extends CommandResults {
  sections: readonly CommandSection[];
  /** The row the keyboard cursor is on, or nothing on a target that has none. */
  cursor: string | undefined;
  /** The row already open behind the palette. */
  selected: string | undefined;
  setQuery: (next: string) => void;
  /** The pointer moves the SAME cursor the arrows do. */
  point: (item: CommandItem) => void;
  choose: (item: CommandItem | undefined) => void;
  close: () => void;
  /** Where the list should be, recomputed whenever the cursor moves. */
  scroll: (offset: number, viewport: number) => number | null;
}

const [CommandContext, useCommand] = partContext<CommandState>('Command.Root');

/**
 * What the palette is showing, for a status line or a footer inside it. Works
 * at any depth under a `<Command.Root>`; throws outside one.
 */
function useCommandResults(): CommandResults {
  const { shown, total, query } = useCommand('Root');
  return { shown, total, query };
}

export type { CommandResults, CommandState };
export { CommandContext, useCommand, useCommandResults };
