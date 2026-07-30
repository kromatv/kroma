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

// The backend is resolved once at module scope, as it is once per launch.
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
    expect(nativeLauncher).toBeNull();
  });
});
