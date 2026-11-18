import type { ImportServer, ImportServerId, ImportSignInId } from '@kromatv/client/importers';
import type { ImportId } from '@kromatv/client/imports';
import type { ModuleId } from '@kromatv/client/modules';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

/** How far the owner is in bringing another server over. */
export interface ImportChoices {
  /** The importer the owner chose. */
  importer: ModuleId | null;
  /** The sign-in that importer keeps, once the other server accepted it. */
  signIn: ImportSignInId | null;
  /** The servers that sign-in reaches. */
  servers: readonly ImportServer[];
  /** The server the owner brings over. */
  server: ImportServerId | null;
  /** The libraries the owner leaves out, by id. */
  skippedLibraries: readonly string[];
  /** The users the owner leaves out, by id. */
  skippedUsers: readonly string[];
  /** The import the owner started. */
  running: ImportId | null;
}

interface Held {
  session: ImportChoices;
  update: (patch: Partial<ImportChoices>) => void;
  restart: () => void;
}

const EMPTY: ImportChoices = {
  importer: null,
  signIn: null,
  servers: [],
  server: null,
  skippedLibraries: [],
  skippedUsers: [],
  running: null,
};

const Context = createContext<Held | null>(null);

/** Holds the import the owner is preparing, so that it is still there when
 * they leave the step and come back to it. */
export function ImportSession({ children }: Readonly<{ children: ReactNode }>) {
  const [session, setSession] = useState(EMPTY);
  const update = useCallback(
    (patch: Partial<ImportChoices>) => setSession((before) => ({ ...before, ...patch })),
    [],
  );
  const restart = useCallback(() => setSession(EMPTY), []);
  const held = useMemo(() => ({ session, update, restart }), [session, update, restart]);
  return <Context.Provider value={held}>{children}</Context.Provider>;
}

/** The import the owner is preparing in this setup. */
export function useImportSession(): Held {
  const held = useContext(Context);
  if (!held) {
    throw new Error('useImportSession needs an <ImportSession> above it');
  }
  return held;
}
