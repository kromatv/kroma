// The launcher backend, or the honest absence of one.
//
// The rows KROMA publishes onto the television's own home screen are the app's
// lists; only the PUBLISHING is platform work, and the native module hides it -
// a content-provider write on Android TV, a hand-off into the App Group's
// UserDefaults on Apple TV.
//
// So this file is thin, and its whole job is the null case. A platform that
// ships no module must yield `null` rather than an object whose methods throw
// the first time the app tries to publish - which would be at boot, on a shell
// that has nothing to do with launchers.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const module = vi.hoisted(() => ({
  present: true,
  setContinueWatching: vi.fn(),
  setHomeChannel: vi.fn(),
}));

vi.mock('../../modules/tv-launcher', () => ({
  get TvLauncher() {
    return module.present
      ? {
          setContinueWatching: module.setContinueWatching,
          setHomeChannel: module.setHomeChannel,
        }
      : null;
  },
}));

type Mod = typeof import('./native-launcher');

/** Load the shell, with or without the native module. The backend is resolved
 *  once at module scope, as it is once per launch. */
async function load(present: boolean): Promise<Mod> {
  module.present = present;
  vi.resetModules();
  return await import('./native-launcher');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('on a platform with the module', () => {
  it('offers a backend', async () => {
    const { nativeLauncher } = await load(true);
    expect(nativeLauncher).not.toBeNull();
  });

  it('hands the continue-watching JSON straight over', async () => {
    const { nativeLauncher } = await load(true);
    nativeLauncher?.setContinueWatching('[{"id":"itm_1"}]');
    // The thin half: the list is the app's, the publishing is the platform's.
    expect(module.setContinueWatching).toHaveBeenCalledWith('[{"id":"itm_1"}]');
  });

  it('hands the home-channel JSON straight over', async () => {
    const { nativeLauncher } = await load(true);
    nativeLauncher?.setHomeChannel('[{"id":"itm_2"}]');
    expect(module.setHomeChannel).toHaveBeenCalledWith('[{"id":"itm_2"}]');
  });

  it('offers both halves, so neither row is silently missing', async () => {
    const { nativeLauncher } = await load(true);
    expect(Object.keys(nativeLauncher ?? {}).sort()).toEqual([
      'setContinueWatching',
      'setHomeChannel',
    ]);
  });
});

describe('on a platform without it', () => {
  it('registers NO backend', async () => {
    const { nativeLauncher } = await load(false);
    // null, not an object whose methods throw the first time the app publishes -
    // which would be at boot, on a shell that has nothing to do with launchers.
    expect(nativeLauncher).toBeNull();
  });
});
