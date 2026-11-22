// @vitest-environment jsdom
vi.mock('#mobile/lib/session', () => ({ useSession: () => ({ requestLocale, adopt }) }));

//
// The data behind the sign-in screen. This is the one screen a user reaches
// before anything works, so every hook here must leave the screen usable on
// failure rather than stranding the user on it.

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const discoverServers = vi.hoisted(() => vi.fn(async () => [] as Array<{ url: string }>));
const clients = vi.hoisted(() => ({ built: [] as string[] }));
const createQueryClient = vi.hoisted(() =>
  vi.fn(({ baseUrl }: { baseUrl: string }) => {
    clients.built.push(baseUrl);
    return {
      baseUrl,
      setLocale: vi.fn(),
      accounts: {
        config: async () => api.config(baseUrl),
        users: async () => api.users(baseUrl),
        kids: {
          list: async (access: string) => api.kids(baseUrl, access),
          open: async (access: string, profile: string) => api.open(baseUrl, access, profile),
        },
      },
      media: { splash: async () => api.splash(baseUrl) },
    };
  }),
);
const api = vi.hoisted(() => ({
  config: async (_url: string) => ({ publicUserList: true, hasAccounts: true }),
  users: async (_url: string) => [{ id: 'u1', username: 'max' }],
  kids: async (_url: string, _access: string) => [{ id: 'leo', username: 'Léo' }],
  open: async (_url: string, _access: string, _profile: string) => ({ token: 'kids-session' }),
  splash: async (_url: string): Promise<unknown[]> => [],
}));
const adopt = vi.hoisted(() => vi.fn());
// `clientUserAgent` too: these hooks build their client through
// `#mobile/lib/device`, which stamps the phone's own User-Agent onto it.
vi.mock('@kromatv/client/query', () => ({ createQueryClient }));
vi.mock('@kromatv/core', () => ({
  discoverServers,
  deviceLocale: () => 'fr',
  clientUserAgent: () => 'Kroma/test',
  sizedImageUrl: (url: string, width: number) => `${url}?w=${width}`,
}));
vi.mock('#mobile/lib/i18n', () => ({ useT: () => (key: string) => key }));

const getDeviceLocalIp = vi.hoisted(() => vi.fn(async () => '192.168.1.20' as string | null));
vi.mock('#mobile/lib/local-ip', () => ({ getDeviceLocalIp }));

const isBiometricLockEnabled = vi.hoisted(() => vi.fn(async (_u: string, _i: string) => false));
vi.mock('#mobile/lib/storage', () => ({ isBiometricLockEnabled }));

import type { MobileAccount } from '#mobile/lib/storage';
import {
  hostOf,
  keyOf,
  useBiometricLockedKeys,
  useClientCache,
  useDeviceKids,
  useDiscoveryLoop,
  useServerRoster,
  useSplashCovers,
} from './sign-in-hooks';

const SWEEP_MS = 4000;

const account = (serverUrl: string, id: string): MobileAccount =>
  ({ serverUrl, accessToken: 't', user: { id, username: id } }) as MobileAccount;

beforeEach(() => {
  vi.clearAllMocks();
  clients.built = [];
  discoverServers.mockResolvedValue([]);
  getDeviceLocalIp.mockResolvedValue('192.168.1.20');
  isBiometricLockEnabled.mockResolvedValue(false);
  api.config = async () => ({ publicUserList: true, hasAccounts: true });
  api.users = async () => [{ id: 'u1', username: 'max' }];
  api.splash = async () => [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('keyOf and hostOf', () => {
  it('identifies an account by the PAIR', () => {
    expect(keyOf(account('https://a', 'u1'))).not.toBe(keyOf(account('https://b', 'u1')));
    expect(keyOf(account('https://a', 'u1'))).not.toBe(keyOf(account('https://a', 'u2')));
  });

  it('is stable for the same account', () => {
    expect(keyOf(account('https://a', 'u1'))).toBe(keyOf(account('https://a', 'u1')));
  });

  it('shows a host without its scheme', () => {
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
    expect(result.current('https://a')).toBe(first);
  });

  it('is the same lookup across renders, so an effect keyed on it runs once', () => {
    const { result, rerender } = renderHook(() => useClientCache());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe('the Kids profiles this phone can open', () => {
  it('lists them on each server with the access of a member remembered there', async () => {
    const accounts = [account('https://a', 'ana')];

    const { result } = renderHook(() => useDeviceKids(accounts));

    await waitFor(() => expect(result.current.offered).toHaveLength(1));
    expect(result.current.offered[0]).toMatchObject({ serverUrl: 'https://a', access: 't' });
  });

  it('adopts the session an opened Kids profile gets, on its own server', async () => {
    const accounts = [account('https://a', 'ana')];
    const { result } = renderHook(() => useDeviceKids(accounts));
    await waitFor(() => expect(result.current.offered).toHaveLength(1));

    const choice = result.current.offered[0];
    if (choice) {
      await result.current.open(choice);
    }

    expect(adopt).toHaveBeenCalledWith('https://a', { token: 'kids-session' });
  });
});

const covering = (serverUrl: string | null) =>
  renderHook(() => useSplashCovers(serverUrl, useClientCache()));

describe('the gate’s splash covers', () => {
  it('dresses the gate in the server’s sample, a film and a series each named so', async () => {
    api.splash = async () => [
      { backdropUrl: '/dune.jpg', title: 'Dune', year: 2021, kind: 'movie' },
      { backdropUrl: '/dark.jpg', title: 'Dark', year: null, kind: 'show' },
    ];

    const { result } = covering('https://a');

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current).toEqual([
      { url: '/dune.jpg?w=640', caption: 'Dune · 2021', eyebrow: 'content.film' },
      { url: '/dark.jpg?w=640', caption: 'Dark', eyebrow: 'content.series' },
    ]);
  });

  it('keeps the plain wash before a server is picked', () => {
    const { result } = covering(null);

    expect(result.current).toEqual([]);
  });

  it('keeps the plain wash when the server does not answer', async () => {
    const splash = vi.fn(async () => {
      throw new Error('down');
    });
    api.splash = splash;

    const { result } = covering('https://a');

    await waitFor(() => expect(splash).toHaveBeenCalled());
    expect(result.current).toEqual([]);
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
    await waitFor(() => expect(discoverServers).toHaveBeenCalledWith({ localIp: '192.168.1.20' }));
  });

  it('sweeps anyway when the device will not say where it is', async () => {
    getDeviceLocalIp.mockResolvedValue(null);
    renderHook(() => useDiscoveryLoop(true));
    // mDNS still works without a subnet guess; passing null would be a
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

    await vi.advanceTimersByTimeAsync(SWEEP_MS + 100);
    expect(discoverServers.mock.calls.length).toBeGreaterThan(1);
  });

  it('STOPS when the picker closes', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useDiscoveryLoop(true));
    await vi.waitFor(() => expect(discoverServers).toHaveBeenCalledOnce());

    unmount();
    await vi.advanceTimersByTimeAsync(SWEEP_MS * 3);
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

    await waitFor(() => expect(result.current.has(keyOf(accounts[1] as MobileAccount))).toBe(true));
    expect(result.current.has(keyOf(accounts[0] as MobileAccount))).toBe(false);
  });

  it('asks about every account, per (server, user)', async () => {
    // Held outside the render: this hook is keyed on the array's identity, and
    // an inline array would re-run the sweep on every render.
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
    api.config = async () => ({ publicUserList: false, hasAccounts: true });
    const { result } = renderHook(() => useServerRoster('https://attic'));
    await waitFor(() => expect(clients.built).toContain('https://attic'));
    expect(result.current).toEqual([]);
  });

  it('stays empty on a server with no accounts yet', async () => {
    api.config = async () => ({ publicUserList: true, hasAccounts: false });
    const { result } = renderHook(() => useServerRoster('https://attic'));
    await waitFor(() => expect(clients.built).toContain('https://attic'));
    expect(result.current).toEqual([]);
  });

  it('stays empty, and usable, when the server cannot be reached', async () => {
    api.config = async () => {
      throw new Error('offline');
    };
    const { result } = renderHook(() => useServerRoster('https://attic'));
    await waitFor(() => expect(clients.built).toContain('https://attic'));
    expect(result.current).toEqual([]);
  });

  it('CLEARS the old roster the moment the server changes', async () => {
    const { result, rerender } = renderHook(({ url }) => useServerRoster(url), {
      initialProps: { url: 'https://attic' as string | null },
    });
    await waitFor(() => expect(result.current).toHaveLength(1));

    api.users = async () => [{ id: 'u9', username: 'other' }];
    rerender({ url: 'https://salon' });
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

function requestLocale() {
  return 'fr';
}
