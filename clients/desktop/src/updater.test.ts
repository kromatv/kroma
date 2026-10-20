// The desktop auto-updater.
//
// Silent by design: a 10-foot app has no update dialog and nobody is watching a
// console, so the only two outcomes that matter are "a newer signed build is
// running" and "nothing happened". There is no third outcome where the app tells
// someone - which is exactly why the failure path has to be exercised. An
// unhandled rejection here does not show a message, it takes down whatever is on
// screen, and the two most ordinary conditions in this app's life reach it: no
// network, and a browser dev run with no Tauri context at all.
//
// The order of the install is the other half. Relaunching before the download
// has finished restarts into the OLD build, and the update then re-downloads on
// every launch forever.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() =>
  vi.fn(async (_cmd: string, _args: { channel: string }) => null as string | null),
);
const relaunch = vi.hoisted(() => vi.fn(async () => undefined));
const session = vi.hoisted(() => ({
  current: null as { serverUrl?: string } | null,
  servers: [] as { url: string }[],
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }));
vi.mock('@kromatv/client/accounts', () => ({
  createAccountStorage: () => ({
    loadSession: () => session.current,
    loadServers: () => session.servers,
  }),
  normalizeServerUrl: (url: string) => url.replace(/\/+$/, ''),
}));

import { startUpdater } from './updater';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const health = (updateChannel?: string) =>
  JSON.stringify({
    status: 'ok',
    version: '0.1.40',
    ffprobe: true,
    libraries: 1,
    items: 1,
    shows: 1,
    updateChannel,
  });

beforeEach(() => {
  vi.clearAllMocks();
  session.current = null;
  session.servers = [];
  invoke.mockResolvedValue(null);
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('on launch', () => {
  it('asks straight away rather than waiting for the first interval', async () => {
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    // Six hours is longer than most sessions of a TV app; waiting for it means
    // most launches never update at all.
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('does nothing when the build is already current', async () => {
    invoke.mockResolvedValue(null);
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    expect(relaunch).not.toHaveBeenCalled();
  });
});

describe('the channel', () => {
  it('follows stable for an app signed into no server', async () => {
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledWith('update_install', { channel: 'Stable' });
  });

  it('follows the channel of the server it is signed into', async () => {
    session.current = { serverUrl: 'http://nas.local:4040/' };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(health('Canary')));

    startUpdater();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledWith('http://nas.local:4040/api/health', expect.anything());
    expect(invoke).toHaveBeenCalledWith('update_install', { channel: 'Canary' });
  });

  it('follows the server it last used while no profile is signed in', async () => {
    session.servers = [{ url: 'http://nas.local:4040' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(health('Canary')));

    startUpdater();
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledWith('update_install', { channel: 'Canary' });
  });

  it('falls back to stable when the server cannot be reached', async () => {
    session.current = { serverUrl: 'http://nas.local:4040' };
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    startUpdater();
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledWith('update_install', { channel: 'Stable' });
  });

  it('falls back to stable for a server too old to say', async () => {
    session.current = { serverUrl: 'http://nas.local:4040' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(health()));

    startUpdater();
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledWith('update_install', { channel: 'Stable' });
  });
});

describe('when a newer build exists', () => {
  it('relaunches once the install answered its version', async () => {
    invoke.mockResolvedValue('0.1.40');

    startUpdater();
    await vi.advanceTimersByTimeAsync(0);

    expect(relaunch).toHaveBeenCalledOnce();
  });

  it('does not relaunch when the install fails', async () => {
    invoke.mockRejectedValue(new Error('disk full'));
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    // Restarting after a half-written install is how a working app becomes a
    // broken one.
    expect(relaunch).not.toHaveBeenCalled();
  });
});

describe('when something goes wrong', () => {
  it('survives being offline', async () => {
    invoke.mockRejectedValue(new Error('network error'));
    // Silent by design means nothing is shown - but an unhandled rejection is
    // not silent, it takes down what is on screen. An escaping rejection fails
    // this test rather than being reported anywhere a user would see it.
    expect(() => startUpdater()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('survives a browser dev run with no Tauri context', async () => {
    invoke.mockRejectedValue(new ReferenceError('__TAURI_INTERNALS__ is not defined'));
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('keeps checking after a failure', async () => {
    invoke.mockRejectedValueOnce(new Error('offline'));
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledOnce();

    // A machine that was offline at launch is usually online later; giving up
    // means it never updates again.
    invoke.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe('while the app keeps running', () => {
  it('checks again every six hours', async () => {
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('does not check before the interval is up', async () => {
    startUpdater();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1000);
    // A TV box is left on for days; a tighter loop is a request per minute
    // against a release API for the entire time.
    expect(invoke).toHaveBeenCalledOnce();
  });
});
