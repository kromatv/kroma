import { afterEach, describe, expect, it, vi } from 'vitest';

type Mod = typeof import('./clientBuild');

const STAMPED = {
  version: '1.4.0',
  commit: 'a1b2c3d',
  commitFull: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  branch: 'main',
  dirty: false,
  buildDate: '2026-02-03T10:00:00Z',
  repository: 'https://github.com/kroma/kroma',
};

const UNSTAMPED = {
  version: 'dev',
  commit: null,
  commitFull: null,
  branch: null,
  dirty: false,
  buildDate: null,
  repository: null,
};

async function launch(): Promise<Mod> {
  vi.resetModules();
  return await import('./clientBuild');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a build nothing stamped', () => {
  it('reads "dev" with every git field absent', async () => {
    const { buildInfo } = await launch();
    expect(buildInfo()).toEqual(UNSTAMPED);
  });

  it('still answers the compatibility check with a version', async () => {
    const { CLIENT_BUILD } = await launch();
    expect(CLIENT_BUILD.version).toBe('dev');
    expect(CLIENT_BUILD.minServerVersion).toBe('0.1.0');
  });
});

describe('a build the bundler stamped', () => {
  it('takes the whole record Vite replaced the name with', async () => {
    vi.stubGlobal('__KROMA_BUILD__', STAMPED);
    const { buildInfo, CLIENT_BUILD } = await launch();
    expect(buildInfo()).toEqual(STAMPED);
    expect(CLIENT_BUILD.version).toBe('1.4.0');
  });

  it('falls back to the version alone when that is all that was defined', async () => {
    vi.stubGlobal('__KROMA_VERSION__', '2.0.0');
    const { buildInfo } = await launch();
    expect(buildInfo()).toEqual({ ...UNSTAMPED, version: '2.0.0' });
  });

  it('ignores an empty stamp rather than reading it as a version', async () => {
    vi.stubGlobal('__KROMA_VERSION__', '');
    vi.stubGlobal('__KROMA_BUILD__', null);
    const { buildInfo } = await launch();
    expect(buildInfo()).toEqual(UNSTAMPED);
  });
});

describe('setBuildInfo', () => {
  it('wins over the bundler stamp, for the shell that has no define', async () => {
    vi.stubGlobal('__KROMA_BUILD__', STAMPED);
    const { buildInfo, setBuildInfo, CLIENT_BUILD } = await launch();
    setBuildInfo({ version: '3.1.4', commit: 'deadbee' });
    expect(buildInfo()).toEqual({ ...UNSTAMPED, version: '3.1.4', commit: 'deadbee' });
    expect(CLIENT_BUILD.version).toBe('3.1.4');
  });

  it('fills the fields the native shell did not pass', async () => {
    const { buildInfo, setBuildInfo } = await launch();
    setBuildInfo({});
    expect(buildInfo()).toEqual(UNSTAMPED);
  });
});
