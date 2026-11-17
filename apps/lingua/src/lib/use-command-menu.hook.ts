import { createContext, useContext, useEffect, useId } from 'react';
import {
  commandRegistry,
  type CommandRegistry,
  type LinguaCommand,
} from '#site/lib/command-registry';

/** What a page reaches of the command menu: opening it, and the registry it lends rows to. */
export interface CommandMenu {
  open: () => void;
  registry: CommandRegistry;
}

/** The command menu the root provides; a page outside it lends its rows to nobody. */
export const CommandMenuContext = createContext<CommandMenu>({
  open: () => {},
  registry: commandRegistry(),
});

/** The command menu around this page. */
export function useCommandMenu(): CommandMenu {
  return useContext(CommandMenuContext);
}

/** Lend `commands` to the command menu for as long as the calling component is mounted. */
export function useCommands(commands: readonly LinguaCommand[]): void {
  const { registry } = useCommandMenu();
  const owner = useId();
  useEffect(() => {
    registry.lend(owner, commands);
  }, [registry, owner, commands]);
  useEffect(() => () => registry.takeBack(owner), [registry, owner]);
}
