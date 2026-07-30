// The module reads the manifest once at load, so each case needs its own module
// instance. They are built up front because `vi.resetModules()` re-imports the
// whole graph, and doing that per test blows the deadline under instrumentation.

import { beforeAll, describe, expect, it, vi } from 'vitest';

const expoConfig = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return expoConfig.value;
    },
  },
}));

type Mod = typeof import('./buildInfo');

async function load(config: Record<string, unknown> | null): Promise<Mod> {
  expoConfig.value = config;
  vi.resetModules();
  return await import('./buildInfo');
}

const FULL = {
  version: '0.1.35',
  extra: {
    buildInfo: {
      version: '0.1.35',
      commit: 'a1b2c3d',
      commitFull: 'a1b2c3d4e5f6',
      branch: 'main',
      dirty: false,
      buildDate: '2026-07-01T10:00:00Z',
      repository: 'https://github.com/maxscharwath/kroma',
    },
  },
};

let inCheckout: Mod;
let legacy: Mod;
let noManifest: Mod;
let outsideCheckout: Mod;

beforeAll(async () => {
  inCheckout = await load(FULL);
  legacy = await load({ version: '0.1.34' });
  noManifest = await load(null);
  outsideCheckout = await load({
    version: '0.1.35',
    extra: { buildInfo: { version: '0.1.35', dirty: false } },
  });
}, 30_000);

describe('a build made in a checkout', () => {
  it('reports everything the manifest carries', () => {
    expect(inCheckout.buildInfo).toEqual(FULL.extra.buildInfo);
  });
});

describe('a manifest with no buildInfo at all', () => {
  it('falls back to expo.version, which every manifest has', () => {
    expect(legacy.buildInfo.version).toBe('0.1.34');
  });

  it('reports nothing rather than something wrong for the git fields', () => {
    // The settings screen hides a null row; '' or 'unknown' would render one.
    expect(legacy.buildInfo.commit).toBeNull();
    expect(legacy.buildInfo.commitFull).toBeNull();
    expect(legacy.buildInfo.branch).toBeNull();
    expect(legacy.buildInfo.buildDate).toBeNull();
    expect(legacy.buildInfo.repository).toBeNull();
  });

  it('is clean rather than dirty when nothing says otherwise', () => {
    expect(legacy.buildInfo.dirty).toBe(false);
  });
});

describe('no manifest at all', () => {
  it('still loads, with an empty version', () => {
    // A throw here happens at import time, and expo-router imports every route at boot.
    expect(noManifest.buildInfo.version).toBe('');
    expect(noManifest.buildInfo.commit).toBeNull();
  });
});

describe('a build made outside a checkout', () => {
  it('keeps the version it has and nulls the rest', () => {
    expect(outsideCheckout.buildInfo.version).toBe('0.1.35');
    expect(outsideCheckout.buildInfo.commit).toBeNull();
    expect(outsideCheckout.buildInfo.branch).toBeNull();
  });
});

describe('how the build is READ', () => {
  it('labels the commit, and marks a dirty tree', () => {
    expect(inCheckout.commitLabel()).toContain('a1b2c3d');
    const dirty = { ...inCheckout.buildInfo, dirty: true };
    expect(inCheckout.commitLabel(dirty)).not.toBe(inCheckout.commitLabel());
  });

  it('has no commit label without a commit', () => {
    expect(legacy.commitLabel()).toBeNull();
  });

  it('labels the repository, and has none without one', () => {
    expect(inCheckout.repoLabel()).toBeTypeOf('string');
    expect(legacy.repoLabel()).toBeNull();
  });

  it('defaults to THIS build, so a caller needs no argument', () => {
    expect(inCheckout.commitLabel()).toBe(inCheckout.commitLabel(inCheckout.buildInfo));
    expect(inCheckout.repoLabel()).toBe(inCheckout.repoLabel(inCheckout.buildInfo));
  });
});
