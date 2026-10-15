import type { WatchableEntry } from '@kromatv/client/watchable';
import { useWatchSources, type WatchSources } from '@kromatv/core/react';
import { useT } from '@kromatv/ui';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';

interface Watchable extends WatchSources {
  entries: WatchableEntry[];
  refresh: () => void;
}

const WatchableCtx = createContext<Watchable | null>(null);

export function WatchableProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user, ready } = useAuth();
  const { client } = useConnection();
  const watch = useWatchSources(ready && user ? client : null, useT());
  const { api } = watch;
  const [entries, setEntries] = useState<WatchableEntry[]>([]);

  const refresh = useCallback(() => {
    if (!api) {
      setEntries([]);
      return;
    }
    api
      .list()
      .then((view) => setEntries(view.entries))
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<Watchable>(
    () => ({ ...watch, entries, refresh }),
    [watch, entries, refresh],
  );
  return <WatchableCtx.Provider value={value}>{children}</WatchableCtx.Provider>;
}

export function useWatchable(): Watchable {
  const c = useContext(WatchableCtx);
  if (!c) throw new Error('useWatchable() must be used inside <WatchableProvider>');
  return c;
}
