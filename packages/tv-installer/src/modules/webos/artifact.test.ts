import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rankArtifacts, resolveArtifact } from '../../install/artifact';
import { buildable } from '../../install/build';
import { root } from '../../root';
import { runOk } from '../../run';
import type { Television } from '../../television';
import { requireTool } from '../../toolchain/detect';
import { resolveWebosArtifact, WEBOS_PACKAGE, WEBOS_SHELL, webosSources } from './artifact';

const { globbed } = vi.hoisted(() => ({ globbed: new Map<string, string[]>() }));

vi.mock('../../install/artifact', async (original) => ({
  ...(await original<typeof import('../../install/artifact')>()),
  resolveArtifact: vi.fn(),
}));
vi.mock('../../run', () => ({ runOk: vi.fn() }));
vi.mock('../../toolchain/detect', async (original) => ({
  ...(await original<typeof import('../../toolchain/detect')>()),
  requireTool: vi.fn(),
}));

class FakeGlob {
  constructor(private readonly pattern: string) {}

  scanSync({ cwd, absolute }: { cwd: string; absolute?: boolean }): string[] {
    const names = globbed.get(this.pattern) ?? [];
    return names.map((name) => (absolute ? join(cwd, name) : name));
  }
}

vi.stubGlobal('Bun', { which: () => null, Glob: FakeGlob });

const webosOut = '/kroma/clients/webos/out';

const chambre: Television = {
  host: '192.168.1.44',
  platform: 'webos',
  vendor: 'LG',
  name: 'Chambre',
  model: 'OLED55C1',
  developerMode: 'on',
  sideloadable: true,
  note: '',
  runtime: null,
};

const buildOf = () => {
  const build = vi.mocked(resolveArtifact).mock.calls[0]?.[0].build;
  if (!build) throw new Error('the LG package named no way to build one');
  return build;
};

beforeEach(() => {
  globbed.clear();
  vi.mocked(requireTool).mockReturnValue('/Users/tester/.bun/bin/ares-install');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('rankArtifacts', () => {
  it('sorts a platform that prefers no build newest first', () => {
    const built = [
      { path: `${webosOut}/tv.kroma.webos_0.1.32_all.ipk`, mtimeMs: 1_000 },
      { path: `${webosOut}/tv.kroma.webos_0.1.33_all.ipk`, mtimeMs: 5_000 },
    ];

    expect(rankArtifacts(built, WEBOS_PACKAGE.preferred)).toEqual([
      `${webosOut}/tv.kroma.webos_0.1.33_all.ipk`,
      `${webosOut}/tv.kroma.webos_0.1.32_all.ipk`,
    ]);
  });
});

describe('buildable', () => {
  it('builds the shell whose sources live in this checkout', () => {
    expect(buildable(WEBOS_SHELL)).toBe(true);
  });
});

describe('webosSources', () => {
  it('offers a build from source on a machine with nothing built and no gh', () => {
    expect(webosSources()).toEqual(['build']);
  });
});

describe('resolveWebosArtifact', () => {
  it('looks for an LG package under the id the downloads are kept by', async () => {
    await resolveWebosArtifact({ tv: chambre, log: () => {} });

    expect(vi.mocked(resolveArtifact).mock.calls[0]?.[0]).toMatchObject({
      id: 'webos',
      kind: WEBOS_PACKAGE,
    });
  });

  it('builds the bundle, then packs it with the CLI beside ares-install', async () => {
    globbed.set('*.ipk', ['tv.kroma.webos_0.1.33_all.ipk']);
    await resolveWebosArtifact({ tv: chambre, source: 'build', log: () => {} });

    const built = await buildOf()(() => {});

    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual(['bun', 'run', 'build:webos']);
    expect(vi.mocked(runOk).mock.calls[1]?.[0]).toEqual([
      '/Users/tester/.bun/bin/ares-package',
      join(root, 'clients/webos/dist'),
      '--no-minify',
      '-o',
      join(root, 'clients/webos/out'),
    ]);
    expect(built).toBe(join(root, 'clients/webos/out', 'tv.kroma.webos_0.1.33_all.ipk'));
  });

  it('refuses a packing run that left no package behind', async () => {
    await resolveWebosArtifact({ tv: chambre, source: 'build', log: () => {} });

    await expect(buildOf()(() => {})).rejects.toThrow('ares-package produced no .ipk');
  });
});
