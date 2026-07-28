// @vitest-environment jsdom
//
// The host a module actually receives.
//
// A module never imports app internals; it gets this surface, which is what
// lets one be compiled in today and runtime-loaded later without the module's
// own code changing. Four things about it are load-bearing and none are visible
// from the type:
//
//   - It is built ONCE. The host reads the newest auth / i18n / router values
//     through a ref, so its identity never changes. Rebuilding it per render
//     re-runs the effect, which calls setHost, which renders again - React error
//     #185, an infinite loop rather than a slow page.
//   - Nothing is wired before there is a session. A module's setup() must not
//     run on the login screen, and `/api/modules` would 401 there anyway.
//   - A DISABLED module is not set up. Its panel is hidden, so running its
//     setup() subscribes a module the operator has switched off.
//   - A failure to start renders with a no-op module API rather than leaving the
//     page on "Wiring modules…" forever. That screen has no retry and no
//     message; it is indistinguishable from a hang.

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionToken = vi.hoisted(() => vi.fn(() => 'tok' as string | null));
const hasPermission = vi.hoisted(() => vi.fn(() => true));
vi.mock('@kroma/core', () => ({ sessionToken, hasPermission }));

const createEventBus = vi.hoisted(() => vi.fn(() => ({ on: vi.fn(), emit: vi.fn() })));
vi.mock('@kroma/module-sdk', () => ({ createEventBus }));

const t = vi.hoisted(() =>
  vi.fn((key: string, vars?: unknown) => `t:${key}:${JSON.stringify(vars)}`),
);
const locale = vi.hoisted(() => ({ value: 'en' }));
vi.mock('@kroma/ui', () => ({
  useT: () => t,
  useLocale: () => locale.value,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

const registry = vi.hoisted(() => ({
  // Both parameters declared, because the second - the set of module ids whose
  // setup() to skip - is what several of these tests read back.
  start: vi.fn(async (base: unknown, _skipSetup?: ReadonlySet<string>) => ({
    ...(base as object),
    getModuleApi: () => undefined,
  })),
}));
vi.mock('#web/modules/registry', () => ({ moduleRegistry: registry }));

const loadRuntimeRemotes = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#web/modules/remotes', () => ({ loadRuntimeRemotes }));

vi.mock('#web/shared/lib/api', () => ({ apiBase: () => 'https://kroma.test' }));

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => auth }));

import { useModuleHost } from './host';

/** The `HostBase` the registry was started with. */
function base() {
  const call = registry.start.mock.calls.at(-1);
  if (!call) throw new Error('the registry was never started');
  return call[0] as {
    api: { get(path: string): Promise<unknown>; listModules(): Promise<unknown> };
    auth: { userId: string | null; can(capability: string): boolean };
    i18n: { t(key: string, vars?: unknown): string; locale: string };
    nav: { navigate(to: string): void };
    bus: unknown;
  };
}

const fetchMock = vi.fn();

/** Answer the next fetch with `body`. */
const answers = (body: unknown, ok = true, status = 200) =>
  fetchMock.mockResolvedValue({ ok, status, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 'u1' };
  locale.value = 'en';
  sessionToken.mockReturnValue('tok');
  hasPermission.mockReturnValue(true);
  registry.start.mockImplementation(async (b: unknown) => ({
    ...(b as object),
    getModuleApi: () => undefined,
  }));
  answers([]);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('before there is a session', () => {
  it('wires nothing', async () => {
    auth.user = null;
    const { result } = renderHook(() => useModuleHost());
    await Promise.resolve();
    // A module's setup() must not run on the login screen, and /api/modules
    // would 401 there anyway.
    expect(registry.start).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('wires as soon as one appears', async () => {
    auth.user = null;
    const { result, rerender } = renderHook(() => useModuleHost());
    expect(result.current).toBeNull();

    auth.user = { id: 'u1' };
    rerender();
    await waitFor(() => expect(result.current).not.toBeNull());
  });
});

describe('starting the modules', () => {
  it('pulls the runtime-loaded ones in FIRST', async () => {
    const order: string[] = [];
    loadRuntimeRemotes.mockImplementation(async () => {
      order.push('remotes');
    });
    registry.start.mockImplementation(async (b: unknown) => {
      order.push('start');
      return { ...(b as object), getModuleApi: () => undefined };
    });
    renderHook(() => useModuleHost());
    await waitFor(() => expect(order).toContain('start'));
    // So they resolve and set up alongside the compile-time ones rather than
    // arriving after everything has been wired.
    expect(order).toEqual(['remotes', 'start']);
  });

  it('skips a module the operator has switched off', async () => {
    answers([
      { id: 'torrents', enabled: false },
      { id: 'vpn', enabled: true },
    ]);
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    const skip = registry.start.mock.calls.at(-1)?.[1] as Set<string>;
    // Its panel is hidden; running its setup() subscribes a module that is off.
    expect(skip.has('torrents')).toBe(true);
    expect(skip.has('vpn')).toBe(false);
  });

  it('sets up EVERYTHING when the enabled state cannot be fetched', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());
    // Unknown must not mean "skip": a transient failure would silently disable
    // every module in the app.
    expect(registry.start.mock.calls.at(-1)?.[1]).toBeUndefined();
  });

  it('renders with a no-op module API when starting fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registry.start.mockRejectedValue(new Error('federation blew up'));
    const { result } = renderHook(() => useModuleHost());

    // "Wiring modules…" has no retry and no message; a hang there is
    // indistinguishable from a crash.
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.getModuleApi('torrents' as never)).toBeUndefined();
  });

  it('re-wires when a module is installed or enabled', async () => {
    const { rerender } = renderHook(({ revision }) => useModuleHost(revision), {
      initialProps: { revision: 0 },
    });
    await waitFor(() => expect(registry.start).toHaveBeenCalledOnce());

    // refresh() bumps this after an install / uninstall / live enable, which is
    // what runs a newly-enabled module's setup() without a page reload.
    rerender({ revision: 1 });
    await waitFor(() => expect(registry.start).toHaveBeenCalledTimes(2));
  });

  it('does not re-wire on an ordinary re-render', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalledOnce());
    rerender();
    rerender();
    // Rebuilding the host per render is React error #185: setHost renders,
    // which rebuilds, which sets host again.
    expect(registry.start).toHaveBeenCalledOnce();
  });

  it('does not set the host after the page is gone', async () => {
    // A holder rather than a plain `let`: assigning inside the promise callback
    // leaves TypeScript still believing the variable is null where it is called.
    type Started = Awaited<ReturnType<typeof registry.start>>;
    const finish: { fire: ((host: Started) => void) | null } = { fire: null };
    registry.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish.fire = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    unmount();
    finish.fire?.({ getModuleApi: () => undefined });
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});

describe('the api the host grants', () => {
  it('carries the session bearer', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    answers({ ok: true });
    await base().api.get('/torrents');
    expect(fetchMock).toHaveBeenLastCalledWith('https://kroma.test/api/torrents', {
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('sends no Authorization header when there is no token', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    sessionToken.mockReturnValue(null);
    answers({ ok: true });
    await base().api.get('/torrents');
    // An empty bearer is a 401 with a confusing message; no header is a clean
    // anonymous request.
    expect(fetchMock).toHaveBeenLastCalledWith('https://kroma.test/api/torrents', { headers: {} });
  });

  it('throws with the path and status when the server refuses', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    answers(null, false, 503);
    // A module's own error handling needs to know which call failed; a resolved
    // undefined would surface as a render crash somewhere else entirely.
    await expect(base().api.get('/torrents')).rejects.toThrow(/\/api\/torrents.*503/);
  });

  it('lists the backend modules from the one endpoint', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    answers([{ id: 'vpn' }]);
    await expect(base().api.listModules()).resolves.toEqual([{ id: 'vpn' }]);
    expect(fetchMock).toHaveBeenLastCalledWith('https://kroma.test/api/modules', expect.anything());
  });
});

describe('what the host reads through the ref', () => {
  it('reports the CURRENT user, not the one at build time', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());
    expect(base().auth.userId).toBe('u1');

    auth.user = { id: 'u2' };
    rerender();
    // The host object is the same one the modules already hold; a module that
    // asked twice must not get a stale answer.
    await waitFor(() => expect(base().auth.userId).toBe('u2'));
  });

  it('reports no user when signed out', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    auth.user = null;
    rerender();
    await waitFor(() => expect(base().auth.userId).toBeNull());
  });

  it('answers a capability against the current account', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    hasPermission.mockReturnValue(true);
    expect(base().auth.can('torrents:read')).toBe(true);
    hasPermission.mockReturnValue(false);
    expect(base().auth.can('torrents:read')).toBe(false);
  });

  it('refuses every capability when there is nobody signed in', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    auth.user = null;
    rerender();
    hasPermission.mockReturnValue(true);
    // Not "ask the permission table about null" - there is no account, so the
    // answer is no whatever the table says.
    await waitFor(() => expect(base().auth.can('torrents:read')).toBe(false));
  });

  it('translates through the app’s own translator, vars and all', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    // Plural and interpolation only work if `vars` is passed through.
    expect(base().i18n.t('torrents.count', { n: 3 })).toBe('t:torrents.count:{"n":3}');
  });

  it('reports the CURRENT locale', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());
    expect(base().i18n.locale).toBe('en');

    locale.value = 'fr';
    rerender();
    // A module rendering after a language switch must not label itself in the
    // old one.
    await waitFor(() => expect(base().i18n.locale).toBe('fr'));
  });

  it('navigates by plain string path', async () => {
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    base().nav.navigate('/modules/torrents');
    // The module system speaks plain paths; the concrete router types its
    // routes, and the cast lives at this single boundary.
    expect(navigate).toHaveBeenCalledWith({ to: '/modules/torrents' });
  });
});

describe('the event bus', () => {
  it('is ONE bus for the whole app', async () => {
    const { unmount } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());
    const first = base().bus;

    unmount();
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalledTimes(2));
    // A module's setup() subscribes once (the registry's setupDone guard), so a
    // fresh bus per visit leaves those subscriptions attached to nothing.
    expect(base().bus).toBe(first);
    // Built at MODULE scope, which is what makes it survive the page: not built
    // again for the second mount, nor for the first, since it already existed
    // before this test ran.
    expect(createEventBus).not.toHaveBeenCalled();
  });
});
