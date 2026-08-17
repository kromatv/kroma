import type { ContinueItem } from '@kroma/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { launcherBackend } from '#tv/app/launcher';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { buildWatchNext } from '#tv/shared/launcher/cards';

interface Continue {
  items: ContinueItem[];
  refresh: () => void;
}

const ContinueCtx = createContext<Continue | null>(null);

export function ContinueProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  const { client } = useConnection();
  const [items, setItems] = useState<ContinueItem[]>([]);

  const refresh = useCallback(() => {
    if (!user || !client) {
      setItems([]);
      return;
    }
    client
      .continueWatching()
      .then(setItems)
      .catch(() => undefined);
  }, [client, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Pushing the same list twice races the native launcher sync into duplicate
  // rows, so guard on the serialized payload.
  const lastPushed = useRef<string>('');
  useEffect(() => {
    const launcher = launcherBackend();
    if (!launcher || !client) return;
    const json = JSON.stringify(buildWatchNext(items, client));
    if (json === lastPushed.current) return;
    lastPushed.current = json;
    launcher.setContinueWatching(json);
  }, [items, client]);

  const value = useMemo<Continue>(() => ({ items, refresh }), [items, refresh]);
  return <ContinueCtx.Provider value={value}>{children}</ContinueCtx.Provider>;
}

export function useContinue(): Continue {
  const c = useContext(ContinueCtx);
  if (!c) throw new Error('useContinue() must be used inside <ContinueProvider>');
  return c;
}
