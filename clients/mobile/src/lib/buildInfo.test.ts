// This build's own identity, as it arrives on the phone.
//
// Nothing here runs git or touches the filesystem: app.config.js collects the
// values at bundle time and they travel in the Expo manifest, so this module
// only reads `extra.buildInfo` back out. Which means the interesting cases are
// all about manifests that do NOT have what this expects:
//
//   - An over-the-air update, or a build made before this config existed, has no
//     `extra.buildInfo` at all. `expo.version` is present in every manifest ever
//     written, which is why it is the fallback rather than a hardcoded string.
//   - A build made outside a git checkout (a tarball, a CI cache restore) has no
//     commit, branch or remote. Every git-derived field is nullable for that
//     reason, and the settings screen hides the rows that are null - so `null`
//     has to stay null rather than becoming 'unknown' or ''.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const expoConfig = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return expoConfig.value;
    },
  },
}));

type Mod = typeof import('./buildInfo');

/** The module reads the manifest ONCE at load, the way the real app does. */
async function load(config: Record<string, unknown> | null): Promise<Mod> {
  expoConfig.value = config;
  vi.resetModules();
  return await import('./buildInfo');
}

const full = {
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a build made in a checkout', () => {
  it('reports everything the manifest carries', async () => {
    const { buildInfo } = await load(full);
    expect(buildInfo).toEqual(full.extra.buildInfo);
  });
});

describe('a manifest with no buildInfo at all', () => {
  it('falls back to expo.version, which every manifest has', async () => {
    // An over-the-air update, or a build predating this config.
    const { buildInfo } = await load({ version: '0.1.34' });
    expect(buildInfo.version).toBe('0.1.34');
  });

  it('reports nothing rather than something wrong for the git fields', async () => {
    const { buildInfo } = await load({ version: '0.1.34' });
    // The settings screen hides a null row; '' or 'unknown' would render one.
    expect(buildInfo.commit).toBeNull();
    expect(buildInfo.commitFull).toBeNull();
    expect(buildInfo.branch).toBeNull();
    expect(buildInfo.buildDate).toBeNull();
    expect(buildInfo.repository).toBeNull();
  });

  it('is clean rather than dirty when nothing says otherwise', async () => {
    const { buildInfo } = await load({ version: '0.1.34' });
    // `dirty` drives a warning badge, so the safe default is the quiet one.
    expect(buildInfo.dirty).toBe(false);
  });
});

describe('no manifest at all', () => {
  it('still loads, with an empty version', async () => {
    // `expoConfig` is null in some launch paths; a throw here happens at import
    // time, and expo-router imports every route at boot.
    const { buildInfo } = await load(null);
    expect(buildInfo.version).toBe('');
    expect(buildInfo.commit).toBeNull();
  });
});

describe('a build made outside a checkout', () => {
  it('keeps the version it has and nulls the rest', async () => {
    const { buildInfo } = await load({
      version: '0.1.35',
      extra: { buildInfo: { version: '0.1.35', dirty: false } },
    });
    expect(buildInfo.version).toBe('0.1.35');
    expect(buildInfo.commit).toBeNull();
    expect(buildInfo.branch).toBeNull();
  });
});

describe('how the build is READ', () => {
  it('labels the commit, and marks a dirty tree', async () => {
    const { commitLabel, buildInfo } = await load(full);
    expect(commitLabel()).toContain('a1b2c3d');
    // A dirty build is one whose source is not the commit it names.
    const dirty = { ...buildInfo, dirty: true };
    expect(commitLabel(dirty)).not.toBe(commitLabel(buildInfo));
  });

  it('has no commit label without a commit', async () => {
    const { commitLabel } = await load({ version: '0.1.34' });
    expect(commitLabel()).toBeNull();
  });

  it('labels the repository, and has none without one', async () => {
    const withRepo = await load(full);
    expect(withRepo.repoLabel()).toBeTypeOf('string');

    const without = await load({ version: '0.1.34' });
    expect(without.repoLabel()).toBeNull();
  });

  it('defaults to THIS build, so a caller needs no argument', async () => {
    const { commitLabel, repoLabel, buildInfo } = await load(full);
    expect(commitLabel()).toBe(commitLabel(buildInfo));
    expect(repoLabel()).toBe(repoLabel(buildInfo));
  });
});
