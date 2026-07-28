// @vitest-environment jsdom
//
// Cold start: restore what was saved, then decide whether this launch may
// silently re-enter the last profile.
//
// Every branch here is a decision about someone's session, and getting one
// wrong is either a security hole or an unexplained sign-out. The three that
// carry the most weight:
//
//   - A PIN-gated 401 is NOT a revoked credential. A PIN-locked profile answers
//     `{ pinRequired: true }`, and treating that as "this token is dead" FORGETS
//     the account - so a user who has done nothing wrong loses a remembered
//     profile they could have unlocked by typing four digits.
//   - A network failure is not a revocation either. On a train, or on a NAS that
//     is asleep, dropping the account means the user re-adds their server by
//     hand for a problem that fixes itself.
//   - The standalone biometric lock must be able to REFUSE. A cold start that
//     resumed regardless would make Face ID decorative.
//
// The dev auto-login is gated twice over - on `__DEV__` and on there being no
// stored accounts - because it exists for a fresh simulator, and a release build
// that baked in the rig's credentials would sign every user into the developer's
// server.

import { KromaApiError } from '@kroma/core';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadServers = vi.hoisted(() => vi.fn(async () => [] as Array<{ url: string }>));
const loadAccounts = vi.hoisted(() => vi.fn(async () => [] as Account[]));
const loadActive = vi.hoisted(() =>
  vi.fn(async () => null as { serverUrl: string; userId: string } | null),
);
vi.mock('#mobile/lib/storage', () => ({ loadServers, loadAccounts, loadActive }));

const passBootBiometricGate = vi.hoisted(() => vi.fn(async () => true));
vi.mock('#mobile/lib/biometricGate', () => ({ passBootBiometricGate }));

import { useBootRestore } from './boot';

interface Account {
  serverUrl: string;
  accessToken: string;
  user: { id: string; username: string; hasPin?: boolean };
}

const account = (over: Partial<Account> = {}): Account => ({
  serverUrl: 'https://attic',
  accessToken: 'device-token',
  user: { id: 'u1', username: 'max', hasPin: false },
  ...over,
});

/** The session surface boot writes through, recorded. */
function deps(over: Record<string, unknown> = {}) {
  const persisted: Account[][] = [];
  const state = {
    accounts: [] as Account[],
    hydratedServers: null as Array<{ url: string }> | null,
    hydratedAccounts: null as Account[] | null,
    entered: null as { url: string; accessToken: string; token: string; user: unknown } | null,
    serverUrl: undefined as string | null | undefined,
    signedOut: 0,
    forgotten: [] as Array<[string, string]>,
    persisted,
  };
  const d = {
    accounts: {
      ref: {
        get current() {
          return state.accounts;
        },
      },
      hydrate: (a: Account[]) => {
        state.hydratedAccounts = a;
        state.accounts = a;
      },
      persist: (a: Account[]) => {
        persisted.push(a);
        state.accounts = a;
      },
      forget: (url: string, id: string) => state.forgotten.push([url, id]),
    },
    servers: {
      hydrate: (s: Array<{ url: string }>) => {
        state.hydratedServers = s;
      },
      persist: vi.fn(),
    },
    makeClient: vi.fn(() => ({
      exchangeToken: vi.fn(async () => ({ token: 'live', user: { id: 'u1', username: 'max' } })),
      login: vi.fn(async () => ({
        accessToken: 'dev-access',
        token: 'dev-live',
        user: { id: 'dev', username: 'dev' },
      })),
    })),
    enterSession: (url: string, accessToken: string, token: string, user: unknown) => {
      state.entered = { url, accessToken, token, user };
    },
    setServerUrl: (url: string | null) => {
      state.serverUrl = url;
    },
    setSignedOut: () => {
      state.signedOut += 1;
    },
    ...over,
  };
  return { d: d as never, state };
}

/** Boot, and wait for the restore to settle. */
async function boot(over: Record<string, unknown> = {}) {
  const { d, state } = deps(over);
  const view = renderHook(() => useBootRestore(d));
  await waitFor(() => expect(state.hydratedAccounts).not.toBeNull());
  return { state, view };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadServers.mockResolvedValue([]);
  loadAccounts.mockResolvedValue([]);
  loadActive.mockResolvedValue(null);
  passBootBiometricGate.mockResolvedValue(true);
  vi.stubGlobal('__DEV__', false);
  vi.stubEnv('EXPO_PUBLIC_KROMA_SERVER', '');
  vi.stubEnv('EXPO_PUBLIC_KROMA_DEV_LOGIN', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('restoring what was saved', () => {
  it('hydrates both lists from device storage', async () => {
    loadServers.mockResolvedValue([{ url: 'https://attic' }]);
    loadAccounts.mockResolvedValue([account()]);
    const { state } = await boot();
    expect(state.hydratedServers).toEqual([{ url: 'https://attic' }]);
    expect(state.hydratedAccounts).toHaveLength(1);
  });

  it('reads all three in parallel', async () => {
    await boot();
    // Three keychain round trips on the launch path; serialising them is three
    // times the blank screen.
    expect(loadServers).toHaveBeenCalled();
    expect(loadAccounts).toHaveBeenCalled();
    expect(loadActive).toHaveBeenCalled();
  });
});

describe('with nothing to resume', () => {
  it('lands signed out on a fresh install', async () => {
    const { state } = await boot();
    expect(state.signedOut).toBe(1);
    expect(state.serverUrl).toBeNull();
    expect(state.entered).toBeNull();
  });

  it('offers the first saved server as the starting point', async () => {
    loadServers.mockResolvedValue([{ url: 'https://attic' }, { url: 'https://salon' }]);
    const { state } = await boot();
    // The picker opens on somewhere plausible instead of an empty field.
    expect(state.serverUrl).toBe('https://attic');
    expect(state.signedOut).toBe(1);
  });

  it('lands signed out when the active pointer names an account that is gone', async () => {
    loadAccounts.mockResolvedValue([account({ user: { id: 'u2', username: 'other' } })]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot();
    // A forgotten profile must not resume as whichever account happens to be
    // first.
    expect(state.entered).toBeNull();
    expect(state.signedOut).toBe(1);
  });
});

describe('the standalone biometric lock', () => {
  it('resumes when the prompt passes', async () => {
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot();
    expect(state.entered).toMatchObject({ url: 'https://attic', accessToken: 'device-token' });
  });

  it('REFUSES the resume when the prompt fails', async () => {
    passBootBiometricGate.mockResolvedValue(false);
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot();
    // A cold start that resumed regardless would make Face ID decorative.
    expect(state.entered).toBeNull();
    expect(state.signedOut).toBe(1);
  });

  it('keeps the account when the prompt fails', async () => {
    passBootBiometricGate.mockResolvedValue(false);
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot();
    // Failing a prompt is not losing a credential; the gate can prompt again.
    expect(state.forgotten).toEqual([]);
    expect(state.serverUrl).toBe('https://attic');
  });

  it('asks about the account it is about to resume', async () => {
    const a = account();
    loadAccounts.mockResolvedValue([a]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    await boot();
    expect(passBootBiometricGate).toHaveBeenCalledWith(a);
  });
});

describe('exchanging the stored device token', () => {
  it('enters the session with the fresh user', async () => {
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot();
    // The cached user can be stale (a renamed profile, a new avatar); the
    // exchange is what refreshes it.
    expect(state.entered?.user).toEqual({ id: 'u1', username: 'max' });
    expect(state.entered?.token).toBe('live');
  });

  it('FORGETS an account whose credential the server rejected', async () => {
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot({
      makeClient: () => ({
        exchangeToken: async () => {
          throw new KromaApiError(401, 'unauthorized', { error: 'revoked' });
        },
      }),
    });
    // The device was signed out elsewhere; keeping it offers a profile that can
    // never open.
    expect(state.forgotten).toEqual([['https://attic', 'u1']]);
    expect(state.signedOut).toBe(1);
  });

  it('KEEPS a PIN-locked account, which answers 401 too', async () => {
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot({
      makeClient: () => ({
        exchangeToken: async () => {
          throw new KromaApiError(401, 'pin required', { pinRequired: true });
        },
      }),
    });
    // THE BUG THIS PREVENTS: reading the gate as a revocation forgets a profile
    // the user could have opened by typing four digits.
    expect(state.forgotten).toEqual([]);
    expect(state.signedOut).toBe(1);
  });

  it('records that the profile is PIN-locked, since the cached user may not say so', async () => {
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot({
      makeClient: () => ({
        exchangeToken: async () => {
          throw new KromaApiError(401, 'pin required', { pinRequired: true });
        },
      }),
    });
    const written = state.persisted.at(-1);
    expect(written?.[0]?.user.hasPin).toBe(true);
  });

  it('marks only the account that answered', async () => {
    const other = account({ serverUrl: 'https://salon', user: { id: 'u9', username: 'other' } });
    loadAccounts.mockResolvedValue([account(), other]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot({
      makeClient: () => ({
        exchangeToken: async () => {
          throw new KromaApiError(401, 'pin required', { pinRequired: true });
        },
      }),
    });
    const written = state.persisted.at(-1);
    // Keyed on the (server, user) pair: the same person on another server is a
    // different profile, and is not PIN-locked just because this one is.
    expect(written?.find((a) => a.user.id === 'u9')?.user.hasPin).toBeFalsy();
  });

  it('KEEPS the account when the network is simply unreachable', async () => {
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot({
      makeClient: () => ({
        exchangeToken: async () => {
          throw new TypeError('Network request failed');
        },
      }),
    });
    // On a train, or against a sleeping NAS. Dropping it makes the user re-add
    // their server by hand for a problem that fixes itself.
    expect(state.forgotten).toEqual([]);
    expect(state.persisted).toEqual([]);
    expect(state.signedOut).toBe(1);
  });

  it('falls back to the account’s own server after a failed resume', async () => {
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { state } = await boot({
      makeClient: () => ({
        exchangeToken: async () => {
          throw new TypeError('offline');
        },
      }),
    });
    // The gate opens on the server they were last using, not on nothing.
    expect(state.serverUrl).toBe('https://attic');
  });
});

describe('the dev rig', () => {
  it('does nothing in a release build', async () => {
    vi.stubGlobal('__DEV__', false);
    vi.stubEnv('EXPO_PUBLIC_KROMA_SERVER', 'https://rig.local');
    vi.stubEnv('EXPO_PUBLIC_KROMA_DEV_LOGIN', 'dev:hunter2');
    const { state } = await boot();
    // A release build that baked in the rig would sign every user into the
    // developer's server.
    expect(state.entered).toBeNull();
    expect(state.signedOut).toBe(1);
  });

  it('signs in automatically on a fresh dev install', async () => {
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_KROMA_SERVER', 'https://rig.local');
    vi.stubEnv('EXPO_PUBLIC_KROMA_DEV_LOGIN', 'dev:hunter2');
    const { state } = await boot();
    expect(state.entered).toMatchObject({ url: 'https://rig.local', accessToken: 'dev-access' });
  });

  it('does NOT auto-login over accounts the device already has', async () => {
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_KROMA_SERVER', 'https://rig.local');
    vi.stubEnv('EXPO_PUBLIC_KROMA_DEV_LOGIN', 'dev:hunter2');
    loadAccounts.mockResolvedValue([account()]);
    const { state } = await boot();
    // It exists for a fresh simulator. Signing in over a real profile would
    // silently swap whose library a developer is looking at.
    expect(state.entered).toBeNull();
    expect(state.serverUrl).toBe('https://rig.local');
  });

  it('falls through to the normal flow when the rig login fails', async () => {
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_KROMA_SERVER', 'https://rig.local');
    vi.stubEnv('EXPO_PUBLIC_KROMA_DEV_LOGIN', 'dev:hunter2');
    const { state } = await boot({
      makeClient: () => ({
        login: async () => {
          throw new Error('rig is down');
        },
      }),
    });
    expect(state.entered).toBeNull();
    expect(state.signedOut).toBe(1);
  });

  it('needs BOTH the server and the credentials', async () => {
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_KROMA_SERVER', 'https://rig.local');
    vi.stubEnv('EXPO_PUBLIC_KROMA_DEV_LOGIN', '');
    const { state } = await boot();
    // A server with no credentials is a normal dev setup, not an auto-login.
    expect(state.entered).toBeNull();
    expect(state.serverUrl).toBe('https://rig.local');
  });
});

describe('leaving before the restore finishes', () => {
  it('runs once per mount, not once per render', async () => {
    loadAccounts.mockResolvedValue([account()]);
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });
    const { d, state } = deps();
    const { rerender } = renderHook(() => useBootRestore(d));
    await waitFor(() => expect(state.entered).not.toBeNull());

    rerender();
    rerender();
    // Re-running a cold start would re-enter a session the user just left.
    expect(loadAccounts).toHaveBeenCalledOnce();
  });

  it('writes nothing after unmount', async () => {
    // A holder rather than a plain `let`: assigning inside the promise callback
    // leaves TypeScript still believing the variable is null where it is called.
    const release: { fire: (() => void) | null } = { fire: null };
    const gate = new Promise<void>((resolve) => {
      release.fire = resolve;
    });
    loadAccounts.mockImplementation(async () => {
      await gate;
      return [account()];
    });
    loadActive.mockResolvedValue({ serverUrl: 'https://attic', userId: 'u1' });

    const { d, state } = deps();
    const { unmount } = renderHook(() => useBootRestore(d));
    unmount();
    release.fire?.();
    await new Promise((r) => setTimeout(r, 10));

    // The screen is gone: hydrating into it, or entering a session on it, is a
    // React warning at best and a resurrected session at worst.
    expect(state.hydratedAccounts).toBeNull();
    expect(state.entered).toBeNull();
    expect(state.signedOut).toBe(0);
  });
});
