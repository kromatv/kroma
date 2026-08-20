// @vitest-environment jsdom
//
// The session state machine every client's <AuthProvider> is.
//
// Its branches are the ones a viewer actually meets: a PIN-locked profile, a
// PIN typed wrong too many times, an access token revoked on another device,
// and the silent re-exchange that keeps a long session alive. Getting any of
// them wrong strands somebody at a login screen with a token that is fine, or
// - worse - leaves a "signed in" state whose every request 401s.

import {
  clearSession,
  KromaApiError,
  type KromaClient,
  type StoredSession,
  saveSession,
  setSessionStorage,
  type User,
} from '@kroma/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthSession } from './auth';

const user = (over: Partial<User> = {}): User =>
  ({ id: 'u1', username: 'ada', email: 'ada@test.dev', hasPin: false, ...over }) as User;

const stored = (over: Partial<StoredSession> = {}): StoredSession => ({
  accessToken: 'access-1',
  user: user(),
  ...over,
});

/** A KromaClient with only the surface the hook touches. */
function fakeClient(over: Partial<Record<keyof KromaClient, unknown>> = {}) {
  const client = {
    exchangeToken: vi.fn(async () => ({ token: 'session-1', user: user() })),
    setAuthToken: vi.fn(),
    setRefreshHandler: vi.fn(),
    relock: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...over,
  };
  return client as unknown as KromaClient & typeof client;
}

/** An API failure shaped the way the server sends it. */
const apiError = (status: number, body?: unknown) =>
  new KromaApiError(status, 'nope', body as never);

/** In-memory device store: this runner has no localStorage. */
function memoryStore() {
  const map = new Map<string, string>();
  setSessionStorage({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  });
  return map;
}

beforeEach(() => {
  memoryStore();
  clearSession();
});

afterEach(() => {
  setSessionStorage(null);
  vi.restoreAllMocks();
});

describe('boot', () => {
  it('is ready and signed out with no remembered account', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.user).toBeNull();
  });

  it('is ready with no client at all', async () => {
    const { result } = renderHook(() => useAuthSession(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('silently exchanges a remembered access token for a session', async () => {
    saveSession(stored());
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(client.exchangeToken).toHaveBeenCalledWith('access-1');
    expect(result.current.user?.id).toBe('u1');
    expect(client.setAuthToken).toHaveBeenCalledWith('session-1');
  });

  // The account stays REMEMBERED: a PIN profile, or a token that needs a fresh
  // login, should land on the picker rather than be forgotten.
  it('drops to the picker when the boot exchange fails', async () => {
    saveSession(stored());
    const client = fakeClient({
      exchangeToken: vi.fn(async () => {
        throw apiError(401, { pinRequired: true });
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.user).toBeNull();
  });

  it('installs a refresh handler and removes it on unmount', () => {
    const client = fakeClient();
    const { unmount } = renderHook(() => useAuthSession(client));
    expect(client.setRefreshHandler).toHaveBeenCalledWith(expect.any(Function));
    unmount();
    expect(client.setRefreshHandler).toHaveBeenLastCalledWith();
  });
});

describe('activate', () => {
  it('signs into a remembered account', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));

    let out: unknown;
    await act(async () => {
      out = await result.current.activate(stored());
    });
    expect(out).toEqual({ ok: true });
    expect(result.current.user?.id).toBe('u1');
  });

  it('passes the PIN through to the exchange', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.activate(stored(), '1234');
    });
    expect(client.exchangeToken).toHaveBeenCalledWith('access-1', '1234');
  });

  it('asks for a PIN when the server says one is required', async () => {
    const client = fakeClient({
      exchangeToken: vi.fn(async () => {
        throw apiError(401, { pinRequired: true });
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const out = await result.current.activate(stored());
    expect(out).toMatchObject({ needsPin: true });
  });

  // A PIN added on another device leaves our cached `hasPin` stale, so the
  // server's flag has to win - but the cached one is the fallback.
  it('asks for a PIN from the cached flag when the server sends none', async () => {
    const client = fakeClient({
      exchangeToken: vi.fn(async () => {
        throw apiError(401);
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const out = await result.current.activate(stored({ user: user({ hasPin: true }) }));
    expect(out).toMatchObject({ needsPin: true });
  });

  // A dead token is NOT a PIN problem: asking for a PIN would loop the viewer
  // through a prompt that can never succeed.
  it('does not ask for a PIN when the token itself is invalid', async () => {
    const client = fakeClient({
      exchangeToken: vi.fn(async () => {
        throw apiError(401, { tokenInvalid: true });
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const out = await result.current.activate(stored({ user: user({ hasPin: true }) }));
    expect(out).toMatchObject({ needsPin: false });
  });

  it('surfaces the cooldown when too many PINs have been tried', async () => {
    const client = fakeClient({
      exchangeToken: vi.fn(async () => {
        throw apiError(429, { retryAfter: 45 });
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const out = await result.current.activate(stored());
    expect(out).toMatchObject({ needsPin: true, retryAfter: 45 });
  });

  it('defaults the cooldown when the server does not name one', async () => {
    const client = fakeClient({
      exchangeToken: vi.fn(async () => {
        throw apiError(429);
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const out = await result.current.activate(stored());
    expect(out).toMatchObject({ retryAfter: 30 });
  });

  it('defaults the cooldown when the server names one it cannot count down', async () => {
    const client = fakeClient({
      exchangeToken: vi.fn(async () => {
        throw apiError(429, { retryAfter: 'in a minute' });
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const out = await result.current.activate(stored());
    expect(out).toMatchObject({ retryAfter: 30 });
  });

  // A server that never answered says nothing about the token: routing to a
  // full re-login here strands a viewer whose wifi dropped for a second.
  it('reports a transport failure as unreachable rather than a dead token', async () => {
    const client = fakeClient({
      exchangeToken: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const out = await result.current.activate(stored({ user: user({ hasPin: true }) }));
    expect(out).toEqual({ ok: false, needsPin: false, unreachable: true });
  });

  it('fails as unreachable without a client', async () => {
    const { result } = renderHook(() => useAuthSession(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const out = await result.current.activate(stored());
    expect(out).toEqual({ ok: false, needsPin: false, unreachable: true });
  });
});

describe('apply', () => {
  it('signs in from a fresh login result', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.apply({
        accessToken: 'a2',
        token: 's2',
        user: user({ id: 'u2' as User['id'] }),
      } as never);
    });
    expect(result.current.user?.id).toBe('u2');
    expect(result.current.accounts.some((a) => a.user.id === 'u2')).toBe(true);
  });
});

describe('switchProfile', () => {
  // Re-LOCK, not forget: the next switch-in must ask for the PIN again.
  it('re-locks the access token and returns to the picker', async () => {
    saveSession(stored());
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    act(() => result.current.switchProfile());
    expect(client.relock).toHaveBeenCalledWith('access-1');
    expect(result.current.user).toBeNull();
  });
});

describe('forget', () => {
  it('revokes and signs out when the forgotten account is the active one', async () => {
    saveSession(stored());
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    act(() => result.current.forget('u1' as User['id']));
    expect(client.logout).toHaveBeenCalledWith('access-1');
    expect(result.current.user).toBeNull();
  });

  it('leaves the session alone when another account is forgotten', async () => {
    saveSession(stored());
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    act(() => result.current.forget('someone-else' as User['id']));
    expect(result.current.user?.id).toBe('u1');
  });
});

describe('logout', () => {
  it('revokes, forgets the device and signs out', async () => {
    saveSession(stored());
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeNull();
    expect(result.current.accounts.some((a) => a.user.id === 'u1')).toBe(false);
  });

  // Best-effort: the server may be unreachable, and the viewer still expects
  // to end up signed out locally.
  it('signs out even when the server revocation fails', async () => {
    saveSession(stored());
    const client = fakeClient({
      logout: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeNull();
  });
});

describe('updateUser', () => {
  it('merges a patch into the active user', async () => {
    saveSession(stored());
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    act(() => result.current.updateUser({ username: 'grace' }));
    expect(result.current.user?.username).toBe('grace');
  });

  it('does nothing when signed out', async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useAuthSession(client));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.updateUser({ username: 'grace' }));
    expect(result.current.user).toBeNull();
  });
});
