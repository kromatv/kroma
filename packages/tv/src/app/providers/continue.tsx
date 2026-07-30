import type { ContinueItem, KromaClient } from '@kroma/core';
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

// A public endpoint, so a launcher can fetch it without the app's auth.
function cardArt(c: ContinueItem, client: KromaClient): string {
  const progress = c.durationMs ? c.positionMs / c.durationMs : 0;
  const params = new URLSearchParams({ label: 'Reprendre', v: c.item.addedAt });
  if (progress > 0) params.set('progress', progress.toFixed(3));
  return `${client.baseUrl}/api/items/${encodeURIComponent(c.item.id)}/card?${params}`;
}

// `backdropUrl` is the clean art for Top Shelf, which draws its own title and
// progress bar and would otherwise show two.
function toWatchNext(items: ContinueItem[], client: KromaClient) {
  return items.map((c) => {
    const it = c.item;
    return {
      id: it.id,
      title: it.showTitle ?? it.title,
      subtitle: it.episodeTitle ?? (it.year ? String(it.year) : ''),
      imageUrl: cardArt(c, client),
      backdropUrl: client.backdropFor(it) ?? undefined,
      // Launchers link an episode card to the SHOW: the movie catalogue cannot
      // resolve an episode id.
      showId: it.showId ?? undefined,
      progressMs: Math.round(c.positionMs),
      durationMs: Math.round(c.durationMs ?? 0),
      kind: it.kind,
      updatedAtMs: Date.parse(c.updatedAt) || Date.now(),
    };
  });
}

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
    const json = JSON.stringify(toWatchNext(items, client));
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
