// @vitest-environment jsdom
//
// The admin console's data hooks and its capability gate.
//
// `isAnyAdmin` / `useCap` decide who sees the console at all, so a wrong answer
// either locks out a moderator or shows management UI to someone who cannot use
// it. The one that is easy to get wrong is `requests.manage`: a requests
// moderator holds no users/library/settings rights but still needs the shell.

import type { Permission, User } from '@kroma/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminKitProvider } from './context';
import { isAnyAdmin, useAsyncAction, useCap, usePoll } from './hooks';

const withPerms = (...permissions: Permission[]) => ({ permissions }) as Pick<User, 'permissions'>;

/** Query provider with retries off, so a rejected fetch settles once. */
function wrapper(user: User | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AdminKitProvider value={{ user } as never}>{children}</AdminKitProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('isAnyAdmin', () => {
  it('is false for nobody and for a plain viewer', () => {
    expect(isAnyAdmin(null)).toBe(false);
    expect(isAnyAdmin(undefined)).toBe(false);
    expect(isAnyAdmin(withPerms('playback'))).toBe(false);
  });

  it('is true for each management capability on its own', () => {
    for (const cap of [
      'users.manage',
      'library.manage',
      'settings.manage',
      // The one worth naming: a requests moderator holds none of the others and
      // still needs the console shell for the Demandes queue.
      'requests.manage',
    ] as Permission[]) {
      expect(isAnyAdmin(withPerms(cap)), cap).toBe(true);
    }
  });
});

describe('useCap', () => {
  it('is false when nobody is signed in', () => {
    const { result } = renderHook(() => useCap('users.manage'), { wrapper: wrapper(null) });
    expect(result.current).toBe(false);
  });

  it('checks the named capability', () => {
    const user = withPerms('library.manage') as User;
    expect(
      renderHook(() => useCap('library.manage'), { wrapper: wrapper(user) }).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useCap('users.manage'), { wrapper: wrapper(user) }).result.current,
    ).toBe(false);
  });

  it('falls back to "any admin" when no capability is named', () => {
    const user = withPerms('requests.manage') as User;
    expect(renderHook(() => useCap(), { wrapper: wrapper(user) }).result.current).toBe(true);
    const viewer = withPerms('playback') as User;
    expect(renderHook(() => useCap(), { wrapper: wrapper(viewer) }).result.current).toBe(false);
  });
});

describe('useAsyncAction', () => {
  it('flips busy around the work and clears it after', async () => {
    const { result } = renderHook(() => useAsyncAction());
    expect(result.current.busy).toBe(false);
    await act(async () => {
      await result.current.run(async () => undefined);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reports a failure through the caller’s formatter', async () => {
    const { result } = renderHook(() => useAsyncAction());
    await act(async () => {
      await result.current.run(
        async () => {
          throw new Error('boom');
        },
        (e) => `failed: ${(e as Error).message}`,
      );
    });
    expect(result.current.error).toBe('failed: boom');
    // Still not busy: the finally has to run on the failure path too.
    expect(result.current.busy).toBe(false);
  });

  it('swallows a failure with no formatter rather than throwing at the caller', async () => {
    const { result } = renderHook(() => useAsyncAction());
    await act(async () => {
      await result.current.run(async () => {
        throw new Error('boom');
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('clears a previous error when the next run starts', async () => {
    const { result } = renderHook(() => useAsyncAction());
    await act(async () => {
      await result.current.run(
        async () => {
          throw new Error('x');
        },
        () => 'first',
      );
    });
    expect(result.current.error).toBe('first');
    await act(async () => {
      await result.current.run(async () => undefined);
    });
    expect(result.current.error).toBeNull();
  });
});

describe('usePoll', () => {
  it('fetches immediately and reports the data', async () => {
    const fn = vi.fn(async () => ({ n: 1 }));
    const { result } = renderHook(() => usePoll(['admin', 'x'], fn, 60_000), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
  });

  it('reads as null before the first answer', () => {
    const { result } = renderHook(() => usePoll(['admin', 'y'], async () => 1, 60_000), {
      wrapper: wrapper(),
    });
    expect(result.current.data).toBeNull();
  });

  // Callers put `reload` in effect deps, so a changing identity would re-run
  // those effects on every render.
  it('keeps a stable reload identity across renders', async () => {
    const { result, rerender } = renderHook(() => usePoll(['admin', 'z'], async () => 1, 60_000), {
      wrapper: wrapper(),
    });
    const first = result.current.reload;
    rerender();
    expect(result.current.reload).toBe(first);
  });

  it('refetches when reload is called', async () => {
    const fn = vi.fn(async () => 1);
    const { result } = renderHook(() => usePoll(['admin', 'r'], fn, 60_000), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.data).toBe(1));
    const before = fn.mock.calls.length;
    await act(async () => result.current.reload());
    await waitFor(() => expect(fn.mock.calls.length).toBeGreaterThan(before));
  });
});
