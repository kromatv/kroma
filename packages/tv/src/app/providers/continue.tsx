import type { ContinueItem } from '@kromatv/client/media';
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
import { useLauncherBackend } from '#tv/app/launcher';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { buildWatchNext } from '#tv/shared/launcher/cards';

interface Continue {
  items: ContinueItem[];
  refresh: () => void;
}

const ContinueCtx = createContext<Continue | null>(null);

export function ContinueProvider({ children }: Readonly<{ children: ReactNode }>) {
  const launcher = useLauncherBackend();
  const { user, ready } = useAuth();
  const { client } = useConnection();
  const [items, setItems] = useState<ContinueItem[]>([]);

  const active = ready && !!user && !!client;
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setItems([]);
  }

  const refresh = useCallback(() => {
    if (!ready || !user || !client) return;
    client.playback
      .continueWatching()
      .then(setItems)
      .catch(() => undefined);
  }, [client, user, ready]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Pushing the same list twice races the native launcher sync into duplicate
  // rows, so guard on the serialized payload.
  const lastPushed = useRef<{ backend: typeof launcher; json: string } | null>(null);
  useEffect(() => {
    if (!launcher || !client) return;
    const json = JSON.stringify(buildWatchNext(items, client));
    if (lastPushed.current?.backend === launcher && json === lastPushed.current.json) return;
    lastPushed.current = { backend: launcher, json };
    launcher.setContinueWatching(json);
  }, [items, client, launcher]);

  const value = useMemo<Continue>(() => ({ items, refresh }), [items, refresh]);
  return <ContinueCtx.Provider value={value}>{children}</ContinueCtx.Provider>;
}

export function useContinue(): Continue {
  const c = useContext(ContinueCtx);
  if (!c) throw new Error('useContinue() must be used inside <ContinueProvider>');
  return c;
}
