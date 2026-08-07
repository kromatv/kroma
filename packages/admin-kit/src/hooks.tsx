// Admin console data hooks and the capability/access helpers.

import { hasPermission, type Permission, type User } from '@kroma/core';
import { useT } from '@kroma/ui';
import { type QueryKey, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useAdminKit } from './context';

/** Polls `fn` every `intervalMs` through TanStack Query. Prefix `key` with `'admin'`
 * so `invalidateQueries(['admin'])` refreshes it, and put varying inputs in `key`. */
export function usePoll<T>(
  key: QueryKey,
  fn: () => Promise<T>,
  intervalMs: number,
): { data: T | null; reload: () => Promise<void> } {
  const queryClient = useQueryClient();
  const { data } = useQuery({
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
  return { data: data ?? null, reload };
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
  const { user } = useAdminKit();
  if (!user) return false;
  return cap ? hasPermission(user, cap) : isAnyAdmin(user);
}

export function Denied() {
  const t = useT();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="rounded-2xl border border-border bg-surface-1 px-8 py-10 text-center shadow-card">
        <div className="font-display text-[18px] font-bold">{t('admin.accessDenied')}</div>
        <p className="mt-2 text-[14px] text-dim">{t('admin.sectionDenied')}</p>
      </div>
    </div>
  );
}
