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
    checkServerCompat: vi.fn(),
    instances: [] as { baseUrl: string }[],
    streams: [] as { url: string; opts: StreamHooks }[],
    reconnect: undefined as (() => void) | undefined,
  };
});

interface StreamHooks {
  onOpen: () => void;
  onClose: () => void;
  onEvent: (e: Record<string, unknown>) => void;
}

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
    constructor(url: string, opts: unknown) {
      H.streams.push({ url, opts: opts as StreamHooks });
    }
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
    checkServerCompat: H.checkServerCompat,
  };
});

type HealthModule = typeof import('#tv/app/useServerHealth');
vi.mock('#tv/app/useServerHealth', async (importOriginal) => {
  const actual = await importOriginal<HealthModule>();
  const useServerHealth: HealthModule['useServerHealth'] = (client, enabled, onReconnect) => {
    H.reconnect = onReconnect;
    return actual.useServerHealth(client, enabled, onReconnect);
  };
  return { useServerHealth };
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

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function signedIn() {
  H.loadSession.mockReturnValue({ serverUrl: 'http://tv.local' });
  H.initialServers.mockReturnValue([{ url: 'http://tv.local', name: 'Home' }]);
  return renderHook(() => useCatalogue('tizen'));
}

function stream() {
  const last = H.streams.at(-1);
  if (!last) throw new Error('no event stream was opened');
  return last;
}

beforeEach(() => {
  vi.resetAllMocks();
  H.instances.length = 0;
  H.streams.length = 0;
  H.checkServerCompat.mockReturnValue('ok');
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

describe('useCatalogue server label', () => {
  it('falls back to the hostname of a server that was never saved', async () => {
    H.initialServers.mockReturnValue([{ url: 'http://a.local', name: 'A' }]);
    const { result } = renderHook(() => useCatalogue('tizen'));
    act(() => result.current.setActiveServer('http://192.168.1.9:4040'));
    await settle();
    expect(result.current.connection.activeServerName).toBe('192.168.1.9');
  });

  it('shows what it was given when that is not a URL at all', async () => {
    const { result } = renderHook(() => useCatalogue('tizen'));
    act(() => result.current.setActiveServer('kroma-box'));
    await settle();
    expect(result.current.connection.activeServerName).toBe('kroma-box');
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

  it('adopts nothing when the sweep comes back empty', async () => {
    const { result } = renderHook(() => useCatalogue('tizen'));
    await settle();
    expect(result.current.connection.discovering).toBe(false);
    expect(result.current.connection.discovered).toEqual([]);
    expect(H.saveServer).not.toHaveBeenCalled();
  });

  it('lists a server found twice once, and adopts none once one is saved', async () => {
    H.discoverServer.mockResolvedValue('http://found.local');
    const { result } = renderHook(() => useCatalogue('tizen'));
    await settle();
    expect(H.saveServer).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.connection.discover();
    });
    await settle();
    expect(result.current.connection.discovered).toEqual(['http://found.local']);
    expect(H.saveServer).toHaveBeenCalledTimes(1);
  });

  it('drops a sweep that only finishes after the screen is gone', async () => {
    let finish: (url: string | null) => void = () => {};
    H.discoverServer.mockReturnValue(
      new Promise<string | null>((resolve) => {
        finish = resolve;
      }),
    );
    const { unmount } = renderHook(() => useCatalogue('tizen'));
    unmount();
    finish('http://found.local');
    await settle();
    expect(H.saveServer).not.toHaveBeenCalled();
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

  it('forgetting another server leaves the active one where it was', async () => {
    H.initialServers.mockReturnValue([
      { url: 'http://a.local', name: 'A' },
      { url: 'http://b.local', name: 'B' },
    ]);
    const { result } = renderHook(() => useCatalogue('tizen'));
    await settle();

    act(() => result.current.connection.forgetServer('http://b.local'));
    await settle();
    expect(result.current.connection.servers.map((s) => s.url)).toEqual(['http://a.local']);
    expect(result.current.activeServerUrl).toBe('http://a.local');
  });

  it('forgetting the last server leaves the TV with none', async () => {
    H.initialServers.mockReturnValue([{ url: 'http://a.local', name: 'A' }]);
    const { result } = renderHook(() => useCatalogue('tizen'));
    await settle();

    act(() => result.current.connection.forgetServer('http://a.local'));
    await settle();
    expect(result.current.activeServerUrl).toBeNull();
    expect(result.current.client).toBeNull();
    expect(result.current.connection.activeServerName).toBeNull();
  });

  it('fetches nothing when a reconnect lands after the last server was forgotten', async () => {
    const { result } = signedIn();
    await settle();

    act(() => result.current.connection.forgetServer('http://tv.local'));
    await settle();
    expect(result.current.client).toBeNull();

    const before = H.movies.mock.calls.length;
    await act(async () => H.reconnect?.());
    expect(H.movies).toHaveBeenCalledTimes(before);
  });
});

describe('useCatalogue deep links', () => {
  it('exposes the link it booted with, and clears it once the screen has it', async () => {
    H.readDeepLink.mockReturnValue({ kind: 'movie', id: 'm1' });
    const { result } = signedIn();
    await settle();
    expect(result.current.connection.deepLink).toEqual({ kind: 'movie', id: 'm1' });

    act(() => result.current.connection.clearDeepLink());
    expect(result.current.connection.deepLink).toBeNull();
  });

  it('picks up a link that arrives while the app is already running', async () => {
    let emit: (link: unknown) => void = () => {};
    H.onDeepLink.mockImplementation((cb: (link: unknown) => void) => {
      emit = cb;
      return () => {};
    });
    const { result } = signedIn();
    await settle();

    act(() => emit({ kind: 'show', id: 's1' }));
    expect(result.current.connection.deepLink).toEqual({ kind: 'show', id: 's1' });
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

  it('surfaces a rejection that is not an Error as its own text', async () => {
    H.movies.mockRejectedValue('offline');
    const { result } = signedIn();
    await settle();
    expect(result.current.connection.error).toBe('offline');
  });
});

describe('useCatalogue live event stream', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tracks the scan and enrich phases as one running activity', async () => {
    const { result } = signedIn();
    await tick();
    const { opts } = stream();
    expect(stream().url).toBe('http://tv.local');

    act(() => opts.onEvent({ type: 'scan.started' }));
    expect(result.current.connection.activity).toMatchObject({
      phase: 'scanning',
      scanning: true,
      items: 0,
    });

    act(() => opts.onEvent({ type: 'enrich.progress', done: 3, total: 10 }));
    expect(result.current.connection.activity).toMatchObject({
      phase: 'enriching',
      scanning: true,
      enrichDone: 3,
      enrichTotal: 10,
    });

    act(() => opts.onEvent({ type: 'enrich.completed', resolved: 9, total: 10 }));
    expect(result.current.connection.activity).toMatchObject({
      phase: 'ready',
      enrichDone: 9,
      enrichTotal: 10,
    });

    act(() => opts.onEvent({ type: 'scan.completed', libraries: 2, shows: 5, items: 40 }));
    expect(result.current.connection.activity).toMatchObject({
      phase: 'ready',
      scanning: false,
      libraries: 2,
      shows: 5,
      items: 40,
    });
  });

  it('ignores an event it has no opinion about', async () => {
    const { result } = signedIn();
    await tick();
    act(() => stream().opts.onEvent({ type: 'device.paired' }));
    expect(result.current.connection.activity).toBeNull();
  });

  it('refetches at once, then coalesces a burst into one trailing refetch', async () => {
    signedIn();
    await tick();
    const { opts } = stream();
    const before = H.movies.mock.calls.length;

    act(() => opts.onEvent({ type: 'library.updated' }));
    await tick();
    expect(H.movies).toHaveBeenCalledTimes(before + 1);

    act(() => opts.onEvent({ type: 'item.updated' }));
    act(() => opts.onEvent({ type: 'show.updated' }));
    await tick();
    expect(H.movies).toHaveBeenCalledTimes(before + 1);

    await tick(2500);
    expect(H.movies).toHaveBeenCalledTimes(before + 2);
  });

  it('keeps the catalogue it has when a live refetch fails', async () => {
    H.movies.mockResolvedValue([{ id: 'm1' }]);
    const { result } = signedIn();
    await tick();

    H.movies.mockRejectedValue(new Error('gone'));
    act(() => stream().opts.onEvent({ type: 'library.updated' }));
    await tick();

    expect(result.current.connection.status).toBe('ready');
    expect(result.current.connection.error).toBe('');
    expect(result.current.connection.movies).toEqual([{ id: 'm1' }]);
  });

  it('reads the server activity when the stream opens, and survives it failing', async () => {
    H.status.mockResolvedValue({
      phase: 'ready',
      scanning: false,
      libraries: 3,
      shows: 0,
      items: 0,
      enrichDone: 0,
      enrichTotal: 0,
      probeDone: 0,
      probeTotal: 0,
      lastScanAt: null,
    });
    const { result } = signedIn();
    await tick();

    act(() => stream().opts.onOpen());
    await tick();
    expect(result.current.connection.activity).toMatchObject({ libraries: 3 });

    H.status.mockRejectedValue(new Error('nope'));
    act(() => stream().opts.onOpen());
    await tick();
    expect(result.current.connection.activity).toMatchObject({ libraries: 3 });
  });

  it('rechecks reachability the moment the stream drops', async () => {
    signedIn();
    await tick();
    const before = H.health.mock.calls.length;

    act(() => stream().opts.onClose());
    await tick();
    expect(H.health.mock.calls.length).toBeGreaterThan(before);
  });

  it('refetches the catalogue when the server comes back', async () => {
    H.health.mockRejectedValue(new Error('down'));
    const { result } = signedIn();
    await tick();
    expect(result.current.connection.online).toBe(false);

    const before = H.movies.mock.calls.length;
    H.health.mockResolvedValue({ version: '0.9.0' });
    await tick(3000);

    expect(result.current.connection.online).toBe(true);
    expect(result.current.connection.serverVersion).toBe('0.9.0');
    expect(H.movies).toHaveBeenCalledTimes(before + 1);
  });

  it('publishes the home-screen carousel a moment after the catalogue is ready', async () => {
    H.movies.mockResolvedValue([{ id: 'm1' }]);
    signedIn();
    await tick();
    expect(H.publishPreview).not.toHaveBeenCalled();

    await tick(1500);
    expect(H.publishPreview).toHaveBeenCalledWith(H.instances[0], [{ id: 'm1' }]);
  });
});
