// Per-user "watched" state, server-backed and shared across every tile plus the
// detail toggle. Toggles are optimistic and revert if the server call fails.

import type { KromaClient } from '@kromatv/client';
import { ItemId, type SubjectId } from '@kromatv/client/media';
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import { useSignedInIds } from '#tv/app/providers/signed-in-ids';

interface Watched {
  has: (id: SubjectId) => boolean;
  setWatched: (id: SubjectId, watched: boolean) => void;
  toggle: (id: SubjectId) => void;
  refresh: () => void;
}

const Ctx = createContext<Watched | null>(null);

const loadWatched = (client: KromaClient) => client.playback.watched();

export function WatchedProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { ids, setIds, client, refresh } = useSignedInIds(loadWatched);

  const setWatched = useCallback(
    (id: SubjectId, watched: boolean) => {
      if (!client) return;
      setIds((prev) => {
        if (prev.has(id) === watched) return prev;
        const next = new Set(prev);
        if (watched) next.add(id);
        else next.delete(id);
        return next;
      });
      const call = watched
        ? client.playback.markWatched(ItemId.parse(id))
        : client.playback.unmarkWatched(ItemId.parse(id));
      call.catch(() => {
        setIds((prev) => {
          const next = new Set(prev);
          if (watched) next.delete(id);
          else next.add(id);
          return next;
        });
      });
    },
    [client],
  );

  const value = useMemo<Watched>(
    () => ({
      has: (id) => ids.has(id),
      setWatched,
      toggle: (id) => setWatched(id, !ids.has(id)),
      refresh,
    }),
    [ids, setWatched, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWatched(): Watched {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWatched() must be used inside <WatchedProvider>');
  return c;
}
