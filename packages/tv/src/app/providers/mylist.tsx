// "Ma liste" the user's bookmarked titles. Server-backed (synced with the web
// client) via the my-list API, hydrated once into a set; toggles are optimistic
// and revert if the server call fails. Mirrors the watched provider.

import type { KromaClient } from '@kromatv/client';
import type { SubjectId } from '@kromatv/client/media';
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import { useSignedInIds } from '#tv/app/providers/signed-in-ids';

interface MyList {
  has: (id: SubjectId) => boolean;
  toggle: (id: SubjectId) => void;
  refresh: () => void;
}

const Ctx = createContext<MyList | null>(null);

const loadMyList = (client: KromaClient) => client.playback.myList();

export function MyListProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { ids, setIds, client, refresh } = useSignedInIds(loadMyList);

  const setInList = useCallback(
    (id: SubjectId, inList: boolean) => {
      if (!client) return;
      setIds((prev) => {
        if (prev.has(id) === inList) return prev;
        const next = new Set(prev);
        if (inList) next.add(id);
        else next.delete(id);
        return next;
      });
      const call = inList ? client.playback.addToList(id) : client.playback.removeFromList(id);
      call.catch(() => {
        setIds((prev) => {
          const next = new Set(prev);
          if (inList) next.delete(id);
          else next.add(id);
          return next;
        });
      });
    },
    [client],
  );

  const value = useMemo<MyList>(
    () => ({
      has: (id) => ids.has(id),
      toggle: (id) => setInList(id, !ids.has(id)),
      refresh,
    }),
    [ids, setInList, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMyList(): MyList {
  const c = useContext(Ctx);
  if (!c) throw new Error('useMyList() must be used inside <MyListProvider>');
  return c;
}
