// "Ma liste": the user's bookmarked titles, hydrated once and shared across the
// detail toggle and the list page. Server-backed, with optimistic toggles that
// revert if the call fails.

import type { SubjectId } from '@kromatv/client/media';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '#web/shared/lib/auth';

interface MyListValue {
  ready: boolean;
  ids: readonly SubjectId[];
  inList: (id: SubjectId) => boolean;
  setInList: (id: SubjectId, inList: boolean) => void;
  toggle: (id: SubjectId) => void;
}

const NONE: readonly SubjectId[] = [];

const MyListContext = createContext<MyListValue | null>(null);

function revertMembership(id: SubjectId, wasAdding: boolean) {
  return (prev: readonly SubjectId[]): readonly SubjectId[] => {
    if (wasAdding) return prev.filter((x) => x !== id);
    return prev.includes(id) ? prev : [id, ...prev];
  };
}

export function MyListProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, user, ready: authReady } = useAuth();
  const [storedIds, setStoredIds] = useState<readonly SubjectId[]>([]);
  const [loadedFor, setLoadedFor] = useState<typeof user>(null);
  const ready = authReady && (!user || loadedFor === user);
  const ids = user ? storedIds : NONE;

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    client.playback
      .myList()
      .then((list) => {
        if (!cancelled) {
          setStoredIds(list);
          setLoadedFor(user);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadedFor(user);
      });
    return () => {
      cancelled = true;
    };
  }, [client, user, authReady]);

  const setInList = useCallback(
    (id: SubjectId, inList: boolean) => {
      if (!user) return;
      setStoredIds((prev) => {
        if (prev.includes(id) === inList) return prev;
        return inList ? [id, ...prev] : prev.filter((x) => x !== id);
      });
      const call = inList ? client.playback.addToList(id) : client.playback.removeFromList(id);
      call.catch(() => {
        setStoredIds(revertMembership(id, inList));
      });
    },
    [client, user],
  );

  const value = useMemo<MyListValue>(() => {
    const set = new Set(ids);
    return {
      ready,
      ids,
      inList: (id) => set.has(id),
      setInList,
      toggle: (id) => setInList(id, !set.has(id)),
    };
  }, [ids, ready, setInList]);

  return <MyListContext.Provider value={value}>{children}</MyListContext.Provider>;
}

/** Throws if used outside `<MyListProvider>`. */
export function useMyList(): MyListValue {
  const ctx = useContext(MyListContext);
  if (!ctx) throw new Error('useMyList must be used within <MyListProvider>');
  return ctx;
}
