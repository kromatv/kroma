// Which build the kit is, on both bundlers: Metro reads Expo's `extra` out of
// `Constants.expoConfig`, Vite replaces `__KROMA_BUILD__` with a literal object.
// Both are read at import time, so both must degrade rather than throw.

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

async function metro(config: Record<string, unknown> | null): Promise<Half> {
  expoConfig.value = config;
  vi.resetModules();
  return (await import('./buildInfo')) as Half;
}

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
    const { BUILD } = await metro({ version: '0.1.35' });
    expect(BUILD.version).toBe('0.1.35');
  });

  it('degrades to nothing when there is no manifest at all', async () => {
    const { BUILD } = await metro(null);
    expect(BUILD).toEqual(EMPTY);
  });

  it('nulls each git field rather than inventing one', async () => {
    const { BUILD } = await metro({ version: '0.1.35' });
    expect(BUILD.commit).toBeNull();
    expect(BUILD.branch).toBeNull();
    expect(BUILD.buildDate).toBeNull();
    expect(BUILD.repository).toBeNull();
    expect(BUILD.dirty).toBe(false);
  });
});

describe('the Vite half', () => {
  it('takes the object the define replaced', async () => {
    const { BUILD } = await vite(STAMPED);
    expect(BUILD).toEqual(STAMPED);
  });

  it('degrades when the define never ran', async () => {
    // Reading an UNDECLARED name is a ReferenceError, not undefined, which is what
    // the `typeof` guard is for.
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
