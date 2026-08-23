import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveArtifact } from '../../install/artifact';
import type { Television } from '../../television';
import { ANDROID_PACKAGE, androidSources, resolveAndroidArtifact } from './artifact';

const { globbed, which } = vi.hoisted(() => ({
  globbed: new Map<string, string[]>(),
  which: vi.fn((_binary: string): string | null => null),
}));

vi.mock('../../install/artifact', async (original) => ({
  ...(await original<typeof import('../../install/artifact')>()),
  resolveArtifact: vi.fn(),
}));
vi.mock('node:fs', () => ({ statSync: () => ({ mtimeMs: 0 }) }));
vi.mock('../../root', () => ({ root: '/kroma' }));

class FakeGlob {
  constructor(private readonly pattern: string) {}

  scanSync({ cwd, absolute }: { cwd: string; absolute?: boolean }): string[] {
    const names = globbed.get(this.pattern) ?? [];
    return names.map((name) => (absolute ? join(cwd, name) : name));
  }
}

vi.stubGlobal('Bun', { Glob: FakeGlob, which });

const shield: Television = {
  host: '192.168.1.36',
  platform: 'androidtv',
  vendor: 'Nvidia',
  name: 'Shield',
  model: 'SHIELD Android TV',
  developerMode: 'on',
  sideloadable: true,
  note: 'network debugging open on 5555',
  runtime: null,
};

beforeEach(() => {
  globbed.clear();
  which.mockReturnValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('androidSources', () => {
  it('offers the package built here and the two releases gh can reach', () => {
    globbed.set('out/*.apk', ['KROMA-androidtv-0.1.33.apk']);
    which.mockReturnValue('/opt/homebrew/bin/gh');

    expect(androidSources()).toEqual(['local', 'stable', 'canary']);
  });

  it('offers the releases alone when nothing has been built here', () => {
    which.mockReturnValue('/opt/homebrew/bin/gh');

    expect(androidSources()).toEqual(['stable', 'canary']);
  });
});

describe('resolveAndroidArtifact', () => {
  it('leaves the Android TV package to the release workflow', async () => {
    const request = { tv: shield, source: 'build', log: () => {} } as const;

    await expect(resolveAndroidArtifact(request)).rejects.toThrow(/release workflow/);
  });

  it('looks for the package under the id the downloads are kept by', async () => {
    await resolveAndroidArtifact({ tv: shield, log: () => {} });

    expect(vi.mocked(resolveArtifact).mock.calls[0]?.[0]).toEqual({
      id: 'androidtv',
      kind: ANDROID_PACKAGE,
    });
  });
});
