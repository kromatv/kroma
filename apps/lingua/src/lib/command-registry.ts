import type { IconName } from '@kromatv/ui/kit/atoms/icon';

/**
 * One row of the command menu: what it says, where it is filed, and what
 * choosing it does. `verb` names that at the foot of the menu, `Open` when
 * left out; `always` keeps a row the server matched whatever the menu reads.
 */
export interface LinguaCommand {
  id: string;
  label: string;
  group: string;
  icon?: IconName;
  subtitle?: string;
  keywords?: string;
  meta?: string;
  verb?: string;
  always?: boolean;
  run: () => void | Promise<unknown>;
}

/**
 * The rows the mounted pages lend the command menu, by who lent them. A page
 * writes its rows while it is up and takes them back when it leaves; the menu
 * reads them all, in the order the pages first lent them.
 */
export interface CommandRegistry {
  lend: (owner: string, commands: readonly LinguaCommand[]) => void;
  takeBack: (owner: string) => void;
  subscribe: (listener: () => void) => () => void;
  rows: () => readonly LinguaCommand[];
}

/** A registry holding nothing yet. */
export function commandRegistry(): CommandRegistry {
  const lent = new Map<string, readonly LinguaCommand[]>();
  const listeners = new Set<() => void>();
  let rows: readonly LinguaCommand[] = [];
  const changed = () => {
    rows = [...lent.values()].flat();
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    lend: (owner, commands) => {
      lent.set(owner, commands);
      changed();
    },
    takeBack: (owner) => {
      if (lent.delete(owner)) {
        changed();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    rows: () => rows,
  };
}
