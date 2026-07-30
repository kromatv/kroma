// The two persisted lists behind a session: saved servers and remembered
// accounts. Each is exposed as state (for rendering) plus a ref (for handlers
// that need the current value without depending on it), behind one write path
// that updates ref, state and device storage together.
//
// Persistence does not live inside a `setState` updater: StrictMode
// double-invokes updaters and the React Compiler may skip a memoized render,
// so a reducer that also writes to the keychain would write twice or go stale.

import { useCallback, useRef, useState } from 'react';
import {
  type MobileAccount,
  type ServerEntry,
  saveAccounts,
  saveServers,
} from '#mobile/lib/storage';

/** Same remembered profile? Account identity is (server, user): the same
 * person on two servers is two accounts, and one server can hold several
 * profiles. */
export function sameAccount(
  a: { serverUrl: string; user: { id: string } },
  serverUrl: string,
  userId: string,
): boolean {
  return a.serverUrl === serverUrl && a.user.id === userId;
}

export interface AccountStore {
  accounts: MobileAccount[];
  ref: React.RefObject<MobileAccount[]>;
  persist(next: MobileAccount[]): void;
  // Seeds from device storage at boot; deliberately does not write it back.
  hydrate(stored: MobileAccount[]): void;
  // Only drops the list entry; keychain secrets are the caller's job.
  forget(serverUrl: string, userId: string): void;
}

export function useAccountStore(): AccountStore {
  const [accounts, setAccounts] = useState<MobileAccount[]>([]);
  const ref = useRef<MobileAccount[]>([]);

  const persist = useCallback((next: MobileAccount[]) => {
    ref.current = next;
    setAccounts(next);
    void saveAccounts(next);
  }, []);

  const hydrate = useCallback((stored: MobileAccount[]) => {
    ref.current = stored;
    setAccounts(stored);
  }, []);

  const forget = useCallback(
    (serverUrl: string, userId: string) => {
      persist(ref.current.filter((a) => !sameAccount(a, serverUrl, userId)));
    },
    [persist],
  );

  return { accounts, ref, persist, hydrate, forget };
}

export interface ServerStore {
  servers: ServerEntry[];
  ref: React.RefObject<ServerEntry[]>;
  persist(next: ServerEntry[]): void;
  hydrate(stored: ServerEntry[]): void;
  touch(url: string, name?: string): void;
  rename(url: string, name: string): void;
  remove(url: string): void;
}

export function useServerStore(): ServerStore {
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const ref = useRef<ServerEntry[]>([]);

  const persist = useCallback((next: ServerEntry[]) => {
    ref.current = next;
    setServers(next);
    void saveServers(next);
  }, []);

  const hydrate = useCallback((stored: ServerEntry[]) => {
    ref.current = stored;
    setServers(stored);
  }, []);

  const touch = useCallback(
    (url: string, name?: string) => {
      const prev = ref.current;
      const known = prev.find((s) => s.url === url);
      persist([
        { url, name: name ?? known?.name, lastUsedAt: Date.now() },
        ...prev.filter((s) => s.url !== url),
      ]);
    },
    [persist],
  );

  const rename = useCallback(
    (url: string, name: string) => {
      const prev = ref.current;
      // No-op when nothing changes: this runs off a health probe on every
      // server-picker mount, and a pointless write would re-render the tree.
      if (!prev.some((s) => s.url === url && s.name !== name)) return;
      persist(prev.map((s) => (s.url === url ? { ...s, name } : s)));
    },
    [persist],
  );

  const remove = useCallback(
    (url: string) => {
      persist(ref.current.filter((s) => s.url !== url));
    },
    [persist],
  );

  return { servers, ref, persist, hydrate, touch, rename, remove };
}
