import type { Permission } from '@kromatv/client/accounts';
import {
  type CommandItem,
  type IconName,
  useCommandKey,
  useStableCallback,
  webDocument,
} from '@kromatv/ui/kit';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useAuth } from '#web/shared/lib/auth';
import type { RoutePath } from '#web/shared/ui/route-link';

const WARM_DELAY_MS = 2000;
const NO_COMMANDS: readonly CommandDef[] = [];

type CommandTarget =
  | {
      to: RoutePath;
      params?: Record<string, string>;
      search?: Record<string, unknown>;
      hash?: string;
      run?: never;
    }
  | { run: () => unknown; to?: never; params?: never; search?: never; hash?: never };

/** What is typed in place of a row or an action when it is left out. */
type Skipped = false | null | undefined | '';

/**
 * Something to do: a `label`, and a route to open (`to`) or a function to call (`run`).
 * A rejected `run` becomes a toast. `confirm` asks first. `tone: 'danger'` draws it in
 * red, apart from the others. `done` is the toast when it worked. `cap` is the
 * capability it needs, or any one of a list.
 */
export type CommandActionDef = CommandTarget & {
  label: string;
  icon?: IconName;
  tone?: 'danger';
  confirm?: { title: string; message?: string; confirmLabel?: string };
  done?: string;
  cap?: Permission | readonly Permission[] | null;
};

/**
 * One row of the command menu: an action, which is what Enter does, with what it takes
 * to find and draw it.
 *
 * `group` is the heading, "This page" when left out. `subtitle` is a second line, and
 * `image` a small poster in place of the `icon`. `keywords` are searched as well as the
 * label, so they hold synonyms in any language, and `meta` is printed at the end of the
 * row and searched too. `always` keeps it listed whatever is typed, below what matched:
 * for a row the server already matched, on something the palette cannot see. `id` is
 * only needed when two rows in a group share a label.
 *
 * `actions` is what else it can do, likeliest first, in the same shape: the first runs
 * on Command or Ctrl with Enter, and Command or Ctrl with K lists them all. A row that
 * opens a page can also open it in a new tab or copy its link, with nothing to declare.
 */
export type CommandDef = CommandActionDef & {
  /** What Enter and a click do, said at the foot of the menu. Left out, it says the row
   *  opens a page or runs. */
  primaryLabel?: string;
  id?: string;
  group?: string;
  subtitle?: string;
  image?: string;
  /** A `poster` by default, or a square `tile` for something like a module. */
  imageShape?: 'poster' | 'tile';
  keywords?: string;
  meta?: string;
  /** A state drawn as a badge at the very end of the row. */
  status?: CommandItem['status'];
  always?: boolean;
  actions?: readonly (CommandActionDef | Skipped)[];
};

function createCommandStore() {
  const owners = new Map<string, readonly CommandDef[]>();
  const listeners = new Set<() => void>();
  let contributed = NO_COMMANDS;
  let open = false;
  let query = '';

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const collect = () => {
    contributed = [...owners.values()].flat();
    emit();
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isOpen: () => open,
    setOpen: (next: boolean) => {
      open = next;
      query = '';
      emit();
    },
    query: () => query,
    setQuery: (next: string) => {
      query = next;
      emit();
    },
    contributed: () => contributed,
    contribute: (owner: string, commands: readonly CommandDef[]) => {
      owners.set(owner, commands);
      collect();
    },
    withdraw: (owner: string) => {
      owners.delete(owner);
      collect();
    },
  };
}

const CommandStore = createContext<ReturnType<typeof createCommandStore> | null>(null);

function coveredByAnotherSurface(): boolean {
  const document = webDocument();
  if (!document) return false;
  if (document.fullscreenElement) return true;
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * Owns the command menu: whether it is open, the rows the mounted components
 * contribute, and the key that opens it for a signed-in viewer. `load` fetches what
 * draws while open, a moment after sign-in, so the first press has nothing to wait
 * for and loses nothing the viewer goes on to type. A load that fails is tried again
 * on the next press.
 */
export function CommandMenuProvider({
  load,
  children,
}: Readonly<{ load: () => Promise<ComponentType>; children: ReactNode }>) {
  const [store] = useState(createCommandStore);
  const [Menu, setMenu] = useState<ComponentType | null>(null);
  const open = useSyncExternalStore(store.subscribe, store.isOpen, () => false);
  const signedIn = useAuth().user !== null;

  const warm = useStableCallback(() => {
    load()
      .then((menu) => setMenu(() => menu))
      .catch((error: unknown) => console.warn('[command-menu] failed to load', error));
  });

  useCommandKey(() => {
    if (!store.isOpen() && !coveredByAnotherSurface()) store.setOpen(true);
  }, signedIn);

  useEffect(() => {
    if (!signedIn) return;
    const timer = setTimeout(warm, WARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [signedIn, warm]);

  useEffect(() => {
    if (open && !Menu) warm();
  }, [open, Menu, warm]);

  return (
    <CommandStore.Provider value={store}>
      {children}
      {open && signedIn && Menu ? (
        <Suspense fallback={null}>
          <Menu />
        </Suspense>
      ) : null}
    </CommandStore.Provider>
  );
}

/**
 * Lists rows in the command menu for as long as the calling component is mounted. A
 * falsy entry is skipped, so a row that only sometimes applies is written `can && {…}`.
 *
 * ```tsx
 * useCommands([
 *   { label: t('content.play'), icon: 'player-play', run: play },
 *   owned && { label: t('content.delete'), icon: 'trash', run: remove },
 * ]);
 * ```
 */
export function useCommands(commands: readonly (CommandDef | Skipped)[]): void {
  const store = useContext(CommandStore);
  const owner = useId();

  useEffect(() => {
    store?.contribute(
      owner,
      commands.filter((row): row is CommandDef => Boolean(row)),
    );
  }, [store, owner, commands]);

  useEffect(() => () => store?.withdraw(owner), [store, owner]);
}

/** What is typed in the command menu right now, for rows that depend on it. */
export function useCommandQuery(): string {
  const store = useContext(CommandStore);
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.query ?? (() => ''),
    () => '',
  );
}

/** Every row the mounted components contribute right now, in the order they mounted. */
export function useContributedCommands(): readonly CommandDef[] {
  const store = useContext(CommandStore);
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.contributed ?? (() => NO_COMMANDS),
    () => NO_COMMANDS,
  );
}

/** Opens and closes the command menu, and sets what is typed in it. */
export function useCommandMenu(): {
  open: () => void;
  close: () => void;
  setQuery: (next: string) => void;
} {
  const store = useContext(CommandStore);
  return useMemo(
    () => ({
      open: () => store?.setOpen(true),
      close: () => store?.setOpen(false),
      setQuery: (next: string) => store?.setQuery(next),
    }),
    [store],
  );
}
