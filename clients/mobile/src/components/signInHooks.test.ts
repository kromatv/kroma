// @vitest-environment jsdom
//
// The data behind the sign-in screen.
//
// This is the one screen a user reaches before anything works, and all four
// hooks are built so that a failure LEAVES THE SCREEN USABLE rather than
// blocking it. The roster is the clearest case: a server that exposes no public
// profile list, or does not answer at all, must still be signable-into through
// the form. An error that emptied the screen would strand someone on the only
// page from which they cannot navigate away.
//
// Two others are about not making things worse while the screen is open. The
// discovery sweep runs in a LOOP for as long as the picker is showing - so it
// must stop on unmount, or a closed picker keeps scanning the LAN every four
// seconds for the rest of the session. And each hook that resolves
// asynchronously must not write state after the screen is gone.
//
// The client cache is smaller but load-bearing in a way the type hides: art
// URLs are resolved per server, so the gate showing four remembered profiles
// across three servers needs one client each, kept - not one per render.

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const discoverServers = vi.hoisted(() => vi.fn(async () => [] as Array<{ url: string }>));
const clients = vi.hoisted(() => ({ built: [] as string[] }));
const KromaClient = vi.hoisted(() =>
  vi.fn(function Client(this: Record<string, unknown>, { baseUrl }: { baseUrl: string }) {
    clients.built.push(baseUrl);
    this.baseUrl = baseUrl;
    this.authConfig = async () => api.authConfig(baseUrl);
    this.users = async () => api.users(baseUrl);
  }),
);
const api = vi.hoisted(() => ({
  authConfig: async (_url: string) => ({ publicUserList: true, hasAccounts: true }),
  users: async (_url: string) => [{ id: 'u1', username: 'max' }],
}));
vi.mock('@kroma/core', () => ({ KromaClient, discoverServers }));

const getDeviceLocalIp = vi.hoisted(() => vi.fn(async () => '192.168.1.20' as string | null));
vi.mock('#mobile/lib/localIp', () => ({ getDeviceLocalIp }));

const isBiometricLockEnabled = vi.hoisted(() => vi.fn(async (_u: string, _i: string) => false));
vi.mock('#mobile/lib/storage', () => ({ isBiometricLockEnabled }));

import type { MobileAccount } from '#mobile/lib/storage';
import {
  hostOf,
  keyOf,
  useBiometricLockedKeys,
  useClientCache,
  useDiscoveryLoop,
  useServerRoster,
} from './signInHooks';

const SWEEP_MS = 4000;

const account = (serverUrl: string, id: string): MobileAccount =>
  ({ serverUrl, accessToken: 't', user: { id, username: id } }) as MobileAccount;

beforeEach(() => {
  vi.clearAllMocks();
  clients.built = [];
  discoverServers.mockResolvedValue([]);
  getDeviceLocalIp.mockResolvedValue('192.168.1.20');
  isBiometricLockEnabled.mockResolvedValue(false);
  api.authConfig = async () => ({ publicUserList: true, hasAccounts: true });
  api.users = async () => [{ id: 'u1', username: 'max' }];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('keyOf and hostOf', () => {
  it('identifies an account by the PAIR', () => {
    // The same person on two servers is two profiles, and the gate shows both.
    expect(keyOf(account('https://a', 'u1'))).not.toBe(keyOf(account('https://b', 'u1')));
    expect(keyOf(account('https://a', 'u1'))).not.toBe(keyOf(account('https://a', 'u2')));
  });

  it('is stable for the same account', () => {
    expect(keyOf(account('https://a', 'u1'))).toBe(keyOf(account('https://a', 'u1')));
  });

  it('shows a host without its scheme', () => {
    // What a person recognises on a 4-inch screen is `attic.local:4040`.
    expect(hostOf('https://attic.local:4040')).toBe('attic.local:4040');
    expect(hostOf('http://192.168.1.20:4040')).toBe('192.168.1.20:4040');
  });

  it('leaves a bare host alone', () => {
    expect(hostOf('attic.local:4040')).toBe('attic.local:4040');
  });
});

describe('the per-server client cache', () => {
  it('builds one client per server', () => {
    const { result } = renderHook(() => useClientCache());
    result.current('https://a');
    result.current('https://b');
    expect(clients.built).toEqual(['https://a', 'https://b']);
  });

  it('hands back the SAME client for a server it has seen', () => {
    const { result } = renderHook(() => useClientCache());
    const first = result.current('https://a');
    expect(result.current('https://a')).toBe(first);
    expect(clients.built).toEqual(['https://a']);
  });

  it('survives a re-render', () => {
    const { result, rerender } = renderHook(() => useClientCache());
    const first = result.current('https://a');
    rerender();
    // The gate re-renders on every tap; a cache rebuilt per render is a client
    // per render, each resolving the same art urls again.
    expect(result.current('https://a')).toBe(first);
  });
});

describe('the discovery sweep', () => {
  it('does nothing while the picker is closed', () => {
    renderHook(() => useDiscoveryLoop(false));
    expect(discoverServers).not.toHaveBeenCalled();
  });

  it('reports what it finds', async () => {
    discoverServers.mockResolvedValue([{ url: 'https://attic' }]);
    const { result } = renderHook(() => useDiscoveryLoop(true));
    await waitFor(() => expect(result.current).toEqual([{ url: 'https://attic' }]));
  });

  it('scans the phone’s own subnet', async () => {
    renderHook(() => useDiscoveryLoop(true));
    // Without the local ip there is no subnet to sweep, so a phone on a
    // 10.0.0.x network would scan 192.168.1.x and find nothing.
    await waitFor(() => expect(discoverServers).toHaveBeenCalledWith({ localIp: '192.168.1.20' }));
  });

  it('sweeps anyway when the device will not say where it is', async () => {
    getDeviceLocalIp.mockResolvedValue(null);
    renderHook(() => useDiscoveryLoop(true));
    // mDNS still works without a subnet guess; passing null through would be a
    // narrower sweep than passing nothing.
    await waitFor(() => expect(discoverServers).toHaveBeenCalledWith({ localIp: undefined }));
  });

  it('keeps sweeping, so a server that wakes up appears', async () => {
    vi.useFakeTimers();
    renderHook(() => useDiscoveryLoop(true));
    await vi.waitFor(() => expect(discoverServers).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(SWEEP_MS + 100);
    expect(discoverServers.mock.calls.length).toBeGreaterThan(1);
  });

  it('retries after a failed sweep rather than stopping', async () => {
    vi.useFakeTimers();
    discoverServers.mockRejectedValueOnce(new Error('no route to host'));
    renderHook(() => useDiscoveryLoop(true));
    await vi.waitFor(() => expect(discoverServers).toHaveBeenCalledOnce());

    // Switching Wi-Fi networks fails one sweep; giving up leaves the picker
    // permanently empty.
    await vi.advanceTimersByTimeAsync(SWEEP_MS + 100);
    expect(discoverServers.mock.calls.length).toBeGreaterThan(1);
  });

  it('STOPS when the picker closes', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useDiscoveryLoop(true));
    await vi.waitFor(() => expect(discoverServers).toHaveBeenCalledOnce());

    unmount();
    await vi.advanceTimersByTimeAsync(SWEEP_MS * 3);
    // A loop left running scans the LAN every four seconds for the rest of the
    // session, on a phone, on battery.
    expect(discoverServers).toHaveBeenCalledOnce();
  });

  it('does not report a result after the picker closes', async () => {
    type Hits = Array<{ url: string }>;
    // A holder rather than a plain `let`: assigning inside the promise callback
    // leaves TypeScript still believing the variable is null where it is called.
    const release: { fire: ((hits: Hits) => void) | null } = { fire: null };
    discoverServers.mockImplementation(
      () =>
        new Promise<Hits>((resolve) => {
          release.fire = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useDiscoveryLoop(true));
    await waitFor(() => expect(discoverServers).toHaveBeenCalled());

    unmount();
    release.fire?.([{ url: 'https://late' }]);
    await Promise.resolve();
    expect(result.current).toEqual([]);
  });
});

describe('the biometric lock badges', () => {
  it('is empty when nothing is locked', async () => {
    const accounts = [account('https://a', 'u1')];
    const { result } = renderHook(() => useBiometricLockedKeys(accounts));
    await waitFor(() => expect(isBiometricLockEnabled).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });

  it('names exactly the locked profiles', async () => {
    isBiometricLockEnabled.mockImplementation(async (_url, id) => id === 'u2');
    const accounts = [account('https://a', 'u1'), account('https://a', 'u2')];
    const { result } = renderHook(() => useBiometricLockedKeys(accounts));

    // These tiles show the same lock badge as PIN-protected ones, so a user
    // knows before tapping that a prompt is coming.
    await waitFor(() => expect(result.current.has(keyOf(accounts[1] as MobileAccount))).toBe(true));
    expect(result.current.has(keyOf(accounts[0] as MobileAccount))).toBe(false);
  });

  it('asks about every account, per (server, user)', async () => {
    // The list is held outside the render on purpose: this hook is keyed on the
    // ARRAY's identity, so a caller building one inline re-runs the sweep on
    // every render - and each sweep sets state, which renders again. The screen
    // passes the session store's own array, which is stable.
    const accounts = [account('https://a', 'u1'), account('https://b', 'u1')];
    renderHook(() => useBiometricLockedKeys(accounts));

    await waitFor(() => expect(isBiometricLockEnabled).toHaveBeenCalledTimes(2));
    expect(isBiometricLockEnabled).toHaveBeenCalledWith('https://a', 'u1');
    expect(isBiometricLockEnabled).toHaveBeenCalledWith('https://b', 'u1');
  });

  it('sweeps ONCE for a stable list, however often the screen renders', async () => {
    const accounts = [account('https://a', 'u1')];
    const { rerender } = renderHook(() => useBiometricLockedKeys(accounts));
    await waitFor(() => expect(isBiometricLockEnabled).toHaveBeenCalledOnce());

    rerender();
    rerender();
    // The gate re-renders on every tap; re-reading the keychain each time would
    // be a keychain round trip per tap.
    expect(isBiometricLockEnabled).toHaveBeenCalledOnce();
  });

  it('does not write after the screen is gone', async () => {
    const holder: { fire: ((locked: boolean) => void) | null } = { fire: null };
    isBiometricLockEnabled.mockImplementation(
      () =>
        new Promise((resolve) => {
          holder.fire = resolve;
        }),
    );
    const accounts = [account('https://a', 'u1')];
    const { result, unmount } = renderHook(() => useBiometricLockedKeys(accounts));
    await waitFor(() => expect(isBiometricLockEnabled).toHaveBeenCalled());

    unmount();
    holder.fire?.(true);
    await Promise.resolve();
    expect(result.current.size).toBe(0);
  });
});

describe('the server’s public profile roster', () => {
  it('reports the roster when the server publishes one', async () => {
    const { result } = renderHook(() => useServerRoster('https://attic'));
    await waitFor(() => expect(result.current).toEqual([{ id: 'u1', username: 'max' }]));
  });

  it('asks for nothing when no server is selected', () => {
    renderHook(() => useServerRoster(null));
    expect(clients.built).toEqual([]);
  });

  it('stays empty when the server keeps its list private', async () => {
    api.authConfig = async () => ({ publicUserList: false, hasAccounts: true });
    const { result } = renderHook(() => useServerRoster('https://attic'));
    await waitFor(() => expect(clients.built).toContain('https://attic'));
    // Not an error: an operator can turn the roster off, and the form still
    // signs in.
    expect(result.current).toEqual([]);
  });

  it('stays empty on a server with no accounts yet', async () => {
    api.authConfig = async () => ({ publicUserList: true, hasAccounts: false });
    const { result } = renderHook(() => useServerRoster('https://attic'));
    await waitFor(() => expect(clients.built).toContain('https://attic'));
    expect(result.current).toEqual([]);
  });

  it('stays empty, and usable, when the server cannot be reached', async () => {
    api.authConfig = async () => {
      throw new Error('offline');
    };
    const { result } = renderHook(() => useServerRoster('https://attic'));
    await waitFor(() => expect(clients.built).toContain('https://attic'));
    // This is the only page a user cannot navigate away from; an error that
    // emptied it would strand them.
    expect(result.current).toEqual([]);
  });

  it('CLEARS the old roster the moment the server changes', async () => {
    const { result, rerender } = renderHook(({ url }) => useServerRoster(url), {
      initialProps: { url: 'https://attic' as string | null },
    });
    await waitFor(() => expect(result.current).toHaveLength(1));

    api.users = async () => [{ id: 'u9', username: 'other' }];
    rerender({ url: 'https://salon' });
    // Showing the previous server's faces under a new server's name is worse
    // than showing none.
    await waitFor(() => expect(result.current).toEqual([{ id: 'u9', username: 'other' }]));
  });

  it('does not report a roster after the screen is gone', async () => {
    type User = { id: string; username: string };
    const holder: { fire: ((users: User[]) => void) | null } = { fire: null };
    api.users = () =>
      new Promise<User[]>((resolve) => {
        holder.fire = resolve;
      });
    const { result, unmount } = renderHook(() => useServerRoster('https://attic'));
    await waitFor(() => expect(clients.built).toContain('https://attic'));

    unmount();
    holder.fire?.([{ id: 'u1', username: 'max' }]);
    await Promise.resolve();
    expect(result.current).toEqual([]);
  });
});
