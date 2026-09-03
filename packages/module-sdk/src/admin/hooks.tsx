// Admin console data hooks and the capability/access helpers.

import { hasPermission, type Permission, type User } from '@kroma/client/accounts';
import { type QueryKey, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useAdminHost } from './context';

const OFF: QueryKey = ['module-sdk', 'idle'];

/** Polls `fn` every `intervalMs` through TanStack Query. Prefix `key` with `'admin'`
 * so `invalidateQueries(['admin'])` refreshes it, and put varying inputs in `key`.
 *
 * `loading` is true only until the FIRST answer; a later poll that fails leaves
 * the last good `data` in place and raises `failed`. `error` is that failure's
 * cause, for a page that says WHY rather than only that it failed. */
export function usePoll<T>(
  key: QueryKey,
  fn: () => Promise<T>,
  intervalMs: number,
): {
  data: T | null;
  loading: boolean;
  failed: boolean;
  error: unknown;
  reload: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: key,
    queryFn: fn,
    refetchInterval: intervalMs,
    // Admin data is live: always stale, so a mount/reload refetches.
    staleTime: 0,
  });
  // Callers put `reload` in effect deps, so its identity must stay stable.
  const keyRef = useRef(key);
  keyRef.current = key;
  // Returns the refetch so a caller that must not show stale rows can await it;
  // ignoring it is fine and is what most call sites do.
  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keyRef.current }),
    [queryClient],
  );
  // `loading` and `failed` are what a page needs to avoid answering with a
  // LIE while the first fetch is out: an empty list and "not configured" are
  // both statements about the data, and neither is true yet.
  return { data: data ?? null, loading: isPending, failed: isError, error, reload };
}

/** Fetches `fn` once through TanStack Query and keeps the answer, for data that
 * does not move: a torrent's file list, a season's episode names. Same shape as
 * {@link usePoll}, so the two are interchangeable at a call site.
 *
 * A `null` key holds the request back until the inputs it needs exist, and
 * reports `loading: false` while it waits, because nothing is in flight. */
export function useFetch<T>(
  key: QueryKey | null,
  fn: () => Promise<T>,
): {
  data: T | null;
  loading: boolean;
  failed: boolean;
  error: unknown;
  reload: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const asked = key !== null;
  const { data, isPending, isError, error } = useQuery({
    queryKey: key ?? OFF,
    queryFn: fn,
    enabled: asked,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const keyRef = useRef(key);
  keyRef.current = key;
  const reload = useCallback(async () => {
    if (keyRef.current) await queryClient.invalidateQueries({ queryKey: keyRef.current });
  }, [queryClient]);
  return { data: data ?? null, loading: asked && isPending, failed: isError, error, reload };
}

/** `run(fn, onError?)` flips `busy` while `fn` runs and, on failure, sets `error` to `onError(e)`. */
export function useAsyncAction(): {
  busy: boolean;
  error: string | null;
  run: (fn: () => Promise<void>, onError?: (e: unknown) => string) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>, onError?: (e: unknown) => string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (onError) setError(onError(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}

/** True if the user holds any management capability, which unlocks the console.
 * `requests.manage` counts: a moderator needs the shell for the requests queue. */
export function isAnyAdmin(user: Pick<User, 'permissions'> | null | undefined): boolean {
  return (
    !!user &&
    (hasPermission(user, 'users.manage') ||
      hasPermission(user, 'library.manage') ||
      hasPermission(user, 'settings.manage') ||
      hasPermission(user, 'requests.manage'))
  );
}

/** Whether the current user satisfies `cap` (or is any admin when `cap` is null). */
export function useCap(cap?: Permission | null): boolean {
  const { user } = useAdminHost();
  if (!user) return false;
  return cap ? hasPermission(user, cap) : isAnyAdmin(user);
}
