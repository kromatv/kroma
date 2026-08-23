import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankArtifacts, resolveArtifact } from '../../install/artifact';
import { buildable } from '../../install/build';
import { root } from '../../root';
import { runOk } from '../../run';
import type { Television } from '../../television';
import { resolveTizenArtifact, TIZEN_PACKAGE, TIZEN_SHELL, tizenSources } from './artifact';

vi.mock('../../install/artifact', async (original) => ({
  ...(await original<typeof import('../../install/artifact')>()),
  resolveArtifact: vi.fn(),
}));
vi.mock('../../run', () => ({ runOk: vi.fn() }));

class EmptyGlob {
  scanSync(): string[] {
    return [];
  }
}

vi.stubGlobal('Bun', { which: () => null, Glob: EmptyGlob });

const tizenOut = '/kroma/clients/tizen/out';

const salon: Television = {
  host: '192.168.1.31',
  platform: 'tizen',
  vendor: 'Samsung',
  name: 'Salon',
  model: 'UE50AU7172',
  developerMode: 'on',
  sideloadable: true,
  note: '',
  runtime: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('rankArtifacts', () => {
  it('puts the every-tier Samsung build ahead of the newer per-tier slices', () => {
    const built = [
      { path: `${tizenOut}/KROMA-tizen8-0.1.33.wgt`, mtimeMs: 3_000 },
      { path: `${tizenOut}/KROMA-tizen4to7-0.1.33.wgt`, mtimeMs: 2_000 },
      { path: `${tizenOut}/KROMA-tizen-0.1.33.wgt`, mtimeMs: 1_000 },
    ];

    expect(rankArtifacts(built, TIZEN_PACKAGE.preferred)).toEqual([
      `${tizenOut}/KROMA-tizen-0.1.33.wgt`,
      `${tizenOut}/KROMA-tizen8-0.1.33.wgt`,
      `${tizenOut}/KROMA-tizen4to7-0.1.33.wgt`,
    ]);
  });
});

describe('buildable', () => {
  it('builds the shell whose sources live in this checkout', () => {
    expect(buildable(TIZEN_SHELL)).toBe(true);
  });
});

describe('tizenSources', () => {
  it('offers a build from source on a machine with nothing built and no gh', () => {
    expect(tizenSources()).toEqual(['build']);
  });
});

describe('resolveTizenArtifact', () => {
  const buildOf = () => {
    const build = vi.mocked(resolveArtifact).mock.calls[0]?.[0].build;
    if (!build) throw new Error('the Samsung package named no way to build one');
    return build;
  };

  it('looks for a Samsung package under the id the downloads are kept by', async () => {
    await resolveTizenArtifact({ tv: salon, log: () => {} });

    expect(vi.mocked(resolveArtifact).mock.calls[0]?.[0]).toMatchObject({
      id: 'tizen',
      kind: TIZEN_PACKAGE,
    });
  });

  it('builds the bundle from this checkout and leaves it unsigned', async () => {
    await resolveTizenArtifact({ tv: salon, source: 'build', log: () => {} });
    const built = await buildOf()(() => {});

    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual(['bun', 'run', 'build:tizen']);
    expect(vi.mocked(runOk).mock.calls[0]?.[1]?.cwd).toBe(root);
    expect(built).toBe(join(root, 'clients/tizen/dist'));
  });
});
