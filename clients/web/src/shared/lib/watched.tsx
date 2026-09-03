// Per-user "watched" state: the whole set of ids is loaded once on sign-in so a
// card checks membership instead of costing a request. Toggling is optimistic.

import { ItemId, type SubjectId } from '@kroma/core';
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
import { useAuth } from '#web/shared/lib/auth';

interface WatchedValue {
  ready: boolean;
  ids: readonly SubjectId[];
  isWatched: (id: SubjectId) => boolean;
  setWatched: (id: SubjectId, watched: boolean) => void;
  toggleWatched: (id: SubjectId) => void;
}

const WatchedContext = createContext<WatchedValue | null>(null);

export function WatchedProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, user, ready: authReady } = useAuth();
  const [ids, setIds] = useState<ReadonlySet<SubjectId>>(() => new Set());
  const [ready, setReady] = useState(false);
  const idsRef = useRef<ReadonlySet<SubjectId>>(ids);
  const apply = useCallback((next: ReadonlySet<SubjectId>) => {
    idsRef.current = next;
    setIds(next);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      apply(new Set());
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    client.playback
      .watched()
      .then((list) => {
        if (!cancelled) {
          apply(new Set(list));
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, user, authReady, apply]);

  const setWatched = useCallback(
    (id: SubjectId, watched: boolean) => {
      if (!user) return;
      if (idsRef.current.has(id) === watched) return;
      const next = new Set(idsRef.current);
      if (watched) next.add(id);
      else next.delete(id);
      apply(next);
      const call = watched
        ? client.playback.markWatched(ItemId.parse(id))
        : client.playback.unmarkWatched(ItemId.parse(id));
      call.catch(() => {
        const reverted = new Set(idsRef.current);
        if (watched) reverted.delete(id);
        else reverted.add(id);
        apply(reverted);
      });
    },
    [client, user, apply],
  );

  const value = useMemo<WatchedValue>(
    () => ({
      ready,
      ids: [...ids],
      isWatched: (id) => ids.has(id),
      setWatched,
      toggleWatched: (id) => setWatched(id, !ids.has(id)),
    }),
    [ids, ready, setWatched],
  );

  return <WatchedContext.Provider value={value}>{children}</WatchedContext.Provider>;
}

/** Throws if used outside `<WatchedProvider>`. */
export function useWatched(): WatchedValue {
  const ctx = useContext(WatchedContext);
  if (!ctx) throw new Error('useWatched must be used within <WatchedProvider>');
  return ctx;
}
