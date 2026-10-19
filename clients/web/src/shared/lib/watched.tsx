// Per-user "watched" state: the whole set of ids is loaded once on sign-in so a
// card checks membership instead of costing a request. Toggling is optimistic.

import { ItemId, type SubjectId } from '@kromatv/client/media';
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
  /** Adopt a watched flag the server already set (a progress save that crossed
   * the line), so the set agrees without a round trip. */
  noteWatched: (id: SubjectId) => void;
}

const NONE: ReadonlySet<SubjectId> = new Set();

const WatchedContext = createContext<WatchedValue | null>(null);

export function WatchedProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, user, ready: authReady } = useAuth();
  const [ids, setIds] = useState<ReadonlySet<SubjectId>>(() => new Set());
  const [loadedFor, setLoadedFor] = useState<typeof user>(null);
  const ready = authReady && (!user || loadedFor === user);
  const idsRef = useRef<ReadonlySet<SubjectId>>(ids);
  const apply = useCallback((next: ReadonlySet<SubjectId>) => {
    idsRef.current = next;
    setIds(next);
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    client.playback
      .watched()
      .then((list) => {
        if (!cancelled) {
          apply(new Set(list));
          setLoadedFor(user);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadedFor(user);
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

  const noteWatched = useCallback(
    (id: SubjectId) => {
      if (!user || idsRef.current.has(id)) return;
      apply(new Set(idsRef.current).add(id));
    },
    [apply, user],
  );

  const visible = user ? ids : NONE;

  const value = useMemo<WatchedValue>(
    () => ({
      ready,
      ids: [...visible],
      isWatched: (id) => visible.has(id),
      setWatched,
      toggleWatched: (id) => setWatched(id, !visible.has(id)),
      noteWatched,
    }),
    [visible, ready, setWatched, noteWatched],
  );

  return <WatchedContext.Provider value={value}>{children}</WatchedContext.Provider>;
}

/** Throws if used outside `<WatchedProvider>`. */
export function useWatched(): WatchedValue {
  const ctx = useContext(WatchedContext);
  if (!ctx) throw new Error('useWatched must be used within <WatchedProvider>');
  return ctx;
}
