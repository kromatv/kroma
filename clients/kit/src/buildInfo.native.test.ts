// Which build the kit is, on both bundlers.
//
// The stamp under the story tree is the same four lines whichever way the site
// was built, and getting there takes two entirely different roads: Metro has no
// `define`, so the identity travels in Expo's `extra` and is read back out of
// `Constants.expoConfig`; Vite replaces `__KROMA_BUILD__` with a literal object
// so none of the collector ships.
//
// Which means the pair has one job - produce the SAME shape - and each half has
// one way to fail at it, both of them at import time, both of them fatal:
//
//   - The web half names a global that only exists when the define ran. A
//     `vite preview` of a dist built elsewhere, or any test harness, has no such
//     name, and reading an undeclared identifier is a ReferenceError rather than
//     `undefined` - hence the `typeof` guard, and hence a blank page instead of
//     a missing version string.
//   - The native half reads through a manifest that may not carry the key, or
//     may not exist at all.
//
// Both degrade to a stamp with nothing in it, and the panel drops the rows it
// cannot fill.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const expoConfig = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return expoConfig.value;
    },
  },
}));

import type { BuildInfo } from './buildInfo.types';

type Half = { BUILD: BuildInfo };

/** The native half, as the manifest of a given build presents it. */
async function metro(config: Record<string, unknown> | null): Promise<Half> {
  expoConfig.value = config;
  vi.resetModules();
  return (await import('./buildInfo')) as Half;
}

/** The web half, with or without the define having run. */
async function vite(defined?: BuildInfo): Promise<Half> {
  vi.stubGlobal('__KROMA_BUILD__', defined);
  vi.resetModules();
  return (await import('./buildInfo.web')) as Half;
}

const STAMPED: BuildInfo = {
  version: '0.1.36',
  commit: 'a1b2c3d',
  branch: 'main',
  dirty: false,
  buildDate: '2026-07-01T10:00:00Z',
  repository: 'https://github.com/maxscharwath/kroma',
};

const EMPTY: BuildInfo = {
  version: '',
  commit: null,
  branch: null,
  dirty: false,
  buildDate: null,
  repository: null,
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('the Metro half', () => {
  it('reads the identity out of the manifest', async () => {
    const { BUILD } = await metro({ version: '0.1.36', extra: { buildInfo: STAMPED } });
    expect(BUILD).toEqual(STAMPED);
  });

  it('falls back to expo.version, which every manifest has', async () => {
    // A build made before this config existed, or an over-the-air update.
    const { BUILD } = await metro({ version: '0.1.35' });
    expect(BUILD.version).toBe('0.1.35');
  });

  it('degrades to nothing when there is no manifest at all', async () => {
    const { BUILD } = await metro(null);
    // Read at import time, and the kit imports this from its shell - a throw
    // here is a blank page rather than a missing version string.
    expect(BUILD).toEqual(EMPTY);
  });

  it('nulls each git field rather than inventing one', async () => {
    const { BUILD } = await metro({ version: '0.1.35' });
    expect(BUILD.commit).toBeNull();
    expect(BUILD.branch).toBeNull();
    expect(BUILD.buildDate).toBeNull();
    expect(BUILD.repository).toBeNull();
    // The panel drops the rows it cannot fill; '' would render an empty one.
    expect(BUILD.dirty).toBe(false);
  });
});

describe('the Vite half', () => {
  it('takes the object the define replaced', async () => {
    const { BUILD } = await vite(STAMPED);
    expect(BUILD).toEqual(STAMPED);
  });

  it('degrades when the define never ran', async () => {
    // A `vite preview` of a dist built elsewhere, or a test harness. Reading an
    // UNDECLARED name is a ReferenceError, not undefined, which is what the
    // `typeof` guard is for.
    const { BUILD } = await vite(undefined);
    expect(BUILD).toEqual(EMPTY);
  });

  it('degrades on a define that is not an object', async () => {
    vi.stubGlobal('__KROMA_BUILD__', 'nonsense');
    vi.resetModules();
    const { BUILD } = (await import('./buildInfo.web')) as Half;
    expect(BUILD).toEqual(EMPTY);
  });

  it('degrades on a null define', async () => {
    vi.stubGlobal('__KROMA_BUILD__', null);
    vi.resetModules();
    const { BUILD } = (await import('./buildInfo.web')) as Half;
    expect(BUILD).toEqual(EMPTY);
  });
});

describe('the two halves together', () => {
  it('produce the same SHAPE, which is the whole point of the pair', async () => {
    const native = await metro({ version: '0.1.36', extra: { buildInfo: STAMPED } });
    const web = await vite(STAMPED);
    // The stamp under the story tree is the same four lines whichever bundler
    // built the site.
    expect(Object.keys(native.BUILD).sort()).toEqual(Object.keys(web.BUILD).sort());
  });

  it('agree on what an unstamped build looks like', async () => {
    const native = await metro(null);
    const web = await vite(undefined);
    expect(native.BUILD).toEqual(web.BUILD);
  });

  it('never throw at import, on either road', async () => {
    await expect(metro(null)).resolves.toBeDefined();
    await expect(vite(undefined)).resolves.toBeDefined();
  });
});
