// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The health monitor and event stream are real but inert here: `client.health`
// resolves and `KromaEvents` never emits.
const H = vi.hoisted(() => {
  const norm = (u: string) => (u || '').replace(/\/+$/, '');
  return {
    norm,
    movies: vi.fn(),
    shows: vi.fn(),
    status: vi.fn(),
    health: vi.fn(),
    itemProgress: vi.fn(),
    discoverServer: vi.fn(),
    loadSession: vi.fn(),
    forgetServer: vi.fn(),
    saveServer: vi.fn(),
    initialServers: vi.fn(),
    readDeepLink: vi.fn(),
    onDeepLink: vi.fn(),
    publishPreview: vi.fn(),
    instances: [] as { baseUrl: string }[],
  };
});

vi.mock('@kroma/core', () => {
  class KromaClient {
    baseUrl: string;
    hasAuth = false;
    movies = H.movies;
    shows = H.shows;
    status = H.status;
    health = H.health;
    itemProgress = H.itemProgress;
    constructor(opts: { baseUrl: string }) {
      this.baseUrl = opts.baseUrl;
      H.instances.push(this);
    }
  }
  class KromaEvents {
    constructor(
      public url: string,
      public opts: unknown,
    ) {}
    connect() {}
    close() {}
  }
  return {
    KromaClient,
    KromaEvents,
    discoverServer: H.discoverServer,
    loadSession: H.loadSession,
    forgetServer: H.forgetServer,
    saveServer: H.saveServer,
    normalizeServerUrl: H.norm,
  };
});

vi.mock('#tv/shared/server', () => ({ initialServers: H.initialServers }));
vi.mock('#tv/shared/preview', () => ({
  readDeepLink: H.readDeepLink,
  onDeepLink: H.onDeepLink,
  publishPreview: H.publishPreview,
}));

// Imported after the mocks are registered (vi.mock is hoisted above this line).
const { useCatalogue } = await import('#tv/app/useCatalogue');

async function settle() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  H.instances.length = 0;
  H.loadSession.mockReturnValue(null);
  H.initialServers.mockReturnValue([]);
  H.movies.mockResolvedValue([]);
  H.shows.mockResolvedValue([]);
  H.status.mockResolvedValue(null);
  H.health.mockResolvedValue(undefined);
  H.itemProgress.mockResolvedValue(null);
  H.discoverServer.mockResolvedValue(null);
  H.saveServer.mockImplementation((s: { url: string; name?: string | null }) => [
    { url: H.norm(s.url), name: s.name ?? null },
  ]);
  H.readDeepLink.mockReturnValue(null);
  H.onDeepLink.mockReturnValue(() => {});
  H.publishPreview.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe('useCatalogue boot session', () => {
  it('builds a client for the saved server and loads the catalogue when signed in', async () => {
    H.loadSession.mockReturnValue({ serverUrl: 'http://tv.local' });
    H.initialServers.mockReturnValue([{ url: 'http://tv.local', name: 'Home' }]);
    H.movies.mockResolvedValue([{ id: 'm1' }]);
    H.shows.mockResolvedValue([{ id: 's1' }]);

    const { result } = renderHook(() => useCatalogue('tizen'));
    expect(H.instances[0]?.baseUrl).toBe('http://tv.local');
    expect(result.current.activeServerUrl).toBe('http://tv.local');

    await settle();
    expect(H.movies).toHaveBeenCalled();
    expect(result.current.connection.status).toBe('ready');
    expect(result.current.connection.movies).toEqual([{ id: 'm1' }]);
    expect(result.current.connection.shows).toEqual([{ id: 's1' }]);
    expect(result.current.connection.activeServerName).toBe('Home');
  });
});

describe('useCatalogue signed-out picker', () => {
  it('makes no catalogue requests until a profile signs in', async () => {
    H.initialServers.mockReturnValue([{ url: 'http://tv.local', name: null }]);
    H.movies.mockResolvedValue([{ id: 'm1' }]);

    const { result } = renderHook(() => useCatalogue('tizen'));
    await settle();
    expect(H.movies).not.toHaveBeenCalled();
    expect(result.current.connection.status).toBe('connecting');

    act(() => result.current.setSignedIn(true));
    await settle();
    expect(H.movies).toHaveBeenCalled();
    expect(result.current.connection.movies).toEqual([{ id: 'm1' }]);
  });
});

describe('useCatalogue discovery', () => {
  it('auto-discovers and adopts a server when none is saved', async () => {
    H.initialServers.mockReturnValue([]);
    H.discoverServer.mockResolvedValue('http://found.local');

    const { result } = renderHook(() => useCatalogue('tizen'));
    expect(result.current.connection.status).toBe('discovering');
    await settle();

    expect(H.discoverServer).toHaveBeenCalled();
    expect(H.saveServer).toHaveBeenCalledWith({ url: 'http://found.local', name: undefined });
    expect(result.current.activeServerUrl).toBe('http://found.local');
  });
});

describe('useCatalogue server management', () => {
  it('setActiveServer normalizes the URL and rebuilds the client', async () => {
    H.initialServers.mockReturnValue([{ url: 'http://a.local', name: 'A' }]);
    const { result } = renderHook(() => useCatalogue('tizen'));
    await settle();

    act(() => result.current.setActiveServer('http://b.local/'));
    await settle();
    expect(result.current.activeServerUrl).toBe('http://b.local');
    expect(H.instances.at(-1)?.baseUrl).toBe('http://b.local');
  });

  it('forgetServer drops it from storage and the active list', async () => {
    H.initialServers.mockReturnValue([
      { url: 'http://a.local', name: 'A' },
      { url: 'http://b.local', name: 'B' },
    ]);
    const { result } = renderHook(() => useCatalogue('tizen'));
    await settle();

    act(() => result.current.connection.forgetServer('http://a.local'));
    await settle();
    expect(H.forgetServer).toHaveBeenCalledWith('http://a.local');
    expect(result.current.connection.servers.map((s) => s.url)).toEqual(['http://b.local']);
    expect(result.current.activeServerUrl).toBe('http://b.local');
  });
});

describe('useCatalogue error handling', () => {
  it('surfaces a fetch failure as the error status', async () => {
    H.loadSession.mockReturnValue({ serverUrl: 'http://tv.local' });
    H.initialServers.mockReturnValue([{ url: 'http://tv.local', name: 'Home' }]);
    H.movies.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useCatalogue('tizen'));
    await settle();
    expect(result.current.connection.status).toBe('error');
    expect(result.current.connection.error).toBe('boom');
  });
});
