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

const check = vi.hoisted(() => vi.fn(async () => null as unknown));
const relaunch = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@tauri-apps/plugin-updater', () => ({ check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }));

import { startUpdater } from './updater';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** An available update that records the order it was driven in. */
function available(order: string[] = []) {
  return {
    version: '0.1.36',
    downloadAndInstall: vi.fn(async () => {
      order.push('install');
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  check.mockResolvedValue(null);
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
    expect(check).toHaveBeenCalledOnce();
  });

  it('does nothing when the build is already current', async () => {
    check.mockResolvedValue(null);
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    expect(relaunch).not.toHaveBeenCalled();
  });
});

describe('when a newer build exists', () => {
  it('installs it and then relaunches', async () => {
    const order: string[] = [];
    const update = available(order);
    relaunch.mockImplementation(async () => {
      order.push('relaunch');
    });
    check.mockResolvedValue(update);

    startUpdater();
    await vi.advanceTimersByTimeAsync(0);

    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    // Relaunching first restarts into the OLD build, and the update then
    // re-downloads on every launch forever.
    expect(order).toEqual(['install', 'relaunch']);
  });

  it('does not relaunch when the install fails', async () => {
    check.mockResolvedValue({
      version: '0.1.36',
      downloadAndInstall: async () => {
        throw new Error('disk full');
      },
    });
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    // Restarting after a half-written install is how a working app becomes a
    // broken one.
    expect(relaunch).not.toHaveBeenCalled();
  });
});

describe('when something goes wrong', () => {
  it('survives being offline', async () => {
    check.mockRejectedValue(new Error('network error'));
    // Silent by design means nothing is shown - but an unhandled rejection is
    // not silent, it takes down what is on screen. An escaping rejection fails
    // this test rather than being reported anywhere a user would see it.
    expect(() => startUpdater()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('survives a browser dev run with no Tauri context', async () => {
    check.mockRejectedValue(new ReferenceError('__TAURI_INTERNALS__ is not defined'));
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('keeps checking after a failure', async () => {
    check.mockRejectedValueOnce(new Error('offline'));
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledOnce();

    // A machine that was offline at launch is usually online later; giving up
    // means it never updates again.
    check.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
  });
});

describe('while the app keeps running', () => {
  it('checks again every six hours', async () => {
    startUpdater();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('does not check before the interval is up', async () => {
    startUpdater();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1000);
    // A TV box is left on for days; a tighter loop is a request per minute
    // against a release API for the entire time.
    expect(check).toHaveBeenCalledOnce();
  });
});
