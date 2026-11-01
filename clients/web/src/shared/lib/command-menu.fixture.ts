import { useId } from 'react';
import type { CommandDef, useCommands } from './command-menu';

const calls = new Map<string, readonly CommandDef[]>();

/** Stands in for `useCommands` in a test with no provider: a re-render replaces what its
 *  call listed, and two calls in one hook add up, as they do in the menu. */
export const useFakeCommands: typeof useCommands = (commands, shared) => {
  calls.set(
    useId(),
    commands.flatMap((row) => (row ? [{ ...shared, ...row }] : [])),
  );
};

/** Every row `useFakeCommands` has been handed, in the order of its calls. */
export const listedCommands = (): readonly CommandDef[] => [...calls.values()].flat();

/** Starts the next test from nothing. */
export const forgetCommands = (): void => calls.clear();
