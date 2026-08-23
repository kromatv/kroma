import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../run';
import type { Television } from '../television';
import {
  availableSources,
  localArtifact,
  type PackageKind,
  rankArtifacts,
  resolveArtifact,
} from './artifact';

const { mtimes, globbed } = vi.hoisted(() => ({
  mtimes: new Map<string, number>(),
  globbed: new Map<string, string[]>(),
}));

vi.mock('node:fs', () => ({
  existsSync: () => true,
  statSync: (path: string) => ({ mtimeMs: mtimes.get(path) ?? 0 }),
}));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn() }));
vi.mock('../root', () => ({ root: '/kroma' }));
vi.mock('../run', () => ({ run: vi.fn() }));

const which = vi.fn<(binary: string) => string | null>();

class FakeGlob {
  constructor(private readonly pattern: string) {}

  scanSync({ cwd, absolute }: { cwd: string; absolute?: boolean }): string[] {
    const names = globbed.get(this.pattern) ?? [];
    return names.map((name) => (absolute ? join(cwd, name) : name));
  }
}

vi.stubGlobal('Bun', { which, Glob: FakeGlob });

const wgt: PackageKind = {
  extension: '.wgt',
  globs: ['clients/tizen/out/*.wgt', 'clients/tizen/dist/*.wgt'],
  pattern: 'KROMA-tizen-*.wgt',
  runArtifact: 'kroma-tizen-wgt',
  preferred: /KROMA-tizen-\d/,
};

const samsung: Television = {
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

const downloads = join(homedir(), '.kroma', 'downloads');
const lines: string[] = [];
const log = (line: string) => lines.push(line);

beforeEach(() => {
  globbed.clear();
  mtimes.clear();
  lines.length = 0;
  which.mockReturnValue('/usr/local/bin/gh');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('rankArtifacts', () => {
  it('answers an empty list when nothing has been built', () => {
    expect(rankArtifacts([])).toEqual([]);
  });

  it('separates two packages of the same age by their name', () => {
    const built = [
      { path: '/out/KROMA-b.wgt', mtimeMs: 1_000 },
      { path: '/out/KROMA-a.wgt', mtimeMs: 1_000 },
    ];

    expect(rankArtifacts(built)).toEqual(['/out/KROMA-b.wgt', '/out/KROMA-a.wgt']);
  });
});

describe('localArtifact', () => {
  it('takes the newest package of every place a build leaves one', () => {
    globbed.set('clients/tizen/out/*.wgt', ['clients/tizen/out/KROMA-tizen-0.1.32.wgt']);
    globbed.set('clients/tizen/dist/*.wgt', ['clients/tizen/dist/KROMA-tizen-0.1.33.wgt']);
    mtimes.set('/kroma/clients/tizen/out/KROMA-tizen-0.1.32.wgt', 1_000);
    mtimes.set('/kroma/clients/tizen/dist/KROMA-tizen-0.1.33.wgt', 5_000);

    expect(localArtifact(wgt)).toBe('/kroma/clients/tizen/dist/KROMA-tizen-0.1.33.wgt');
  });

  it('answers nothing when this checkout has built none', () => {
    expect(localArtifact(wgt)).toBeNull();
  });
});

describe('availableSources', () => {
  it('offers what is built here, both release channels and a build from source', () => {
    globbed.set('clients/tizen/out/*.wgt', ['clients/tizen/out/KROMA-tizen-0.1.33.wgt']);

    expect(availableSources(wgt, true)).toEqual(['local', 'stable', 'canary', 'build']);
  });

  it('offers no release channel on a machine with no gh to fetch one', () => {
    which.mockReturnValue(null);

    expect(availableSources(wgt, true)).toEqual(['build']);
  });

  it('offers no build for a shell whose sources are not here', () => {
    which.mockReturnValue(null);

    expect(availableSources(wgt, false)).toEqual([]);
  });
});

describe('resolveArtifact', () => {
  const from = { id: 'tizen', kind: wgt, build: vi.fn() };

  it('takes the package it was given over anything else', async () => {
    const path = await resolveArtifact(from, { tv: samsung, given: '/tmp/KROMA.wgt', log });

    expect(path).toBe('/tmp/KROMA.wgt');
    expect(from.build).not.toHaveBeenCalled();
    expect(vi.mocked(run)).not.toHaveBeenCalled();
  });

  it('builds from source when that is the source asked for', async () => {
    from.build.mockResolvedValue('/kroma/clients/tizen/dist');

    const path = await resolveArtifact(from, { tv: samsung, source: 'build', log });

    expect(path).toBe('/kroma/clients/tizen/dist');
  });

  it('names the package it found in this checkout, relative to the checkout', async () => {
    globbed.set('clients/tizen/out/*.wgt', ['clients/tizen/out/KROMA-tizen-0.1.33.wgt']);

    const path = await resolveArtifact(from, { tv: samsung, log });

    expect(path).toBe('/kroma/clients/tizen/out/KROMA-tizen-0.1.33.wgt');
    expect(lines).toEqual(['package: clients/tizen/out/KROMA-tizen-0.1.33.wgt']);
  });

  it('pulls the stable release when this checkout has built nothing', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: '' });
    globbed.set('*.wgt', ['KROMA-tizen-0.1.33.wgt']);

    const path = await resolveArtifact(from, { tv: samsung, log });

    expect(vi.mocked(run).mock.calls[0]?.[0]).toEqual([
      'gh',
      'release',
      'download',
      '--pattern',
      'KROMA-tizen-*.wgt',
      '--dir',
      join(downloads, 'stable', 'tizen'),
      '--clobber',
    ]);
    expect(path).toBe(join(downloads, 'stable', 'tizen', 'KROMA-tizen-0.1.33.wgt'));
  });

  it('names the canary tag when the canary channel is the one asked for', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: '' });
    globbed.set('*.wgt', ['KROMA-tizen-0.1.34.wgt']);

    await resolveArtifact(from, { tv: samsung, source: 'canary', log });

    expect(vi.mocked(run).mock.calls[0]?.[0]).toEqual([
      'gh',
      'release',
      'download',
      'canary',
      '--pattern',
      'KROMA-tizen-*.wgt',
      '--dir',
      join(downloads, 'canary', 'tizen'),
      '--clobber',
    ]);
  });

  it('says what to run by hand on a machine with no gh', async () => {
    which.mockReturnValue(null);

    await expect(resolveArtifact(from, { tv: samsung, source: 'stable', log })).rejects.toThrow(
      'no .wgt here and no gh to fetch one: gh run download -n kroma-tizen-wgt',
    );
  });

  it('refuses a release that carried no package of that kind', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: '' });

    await expect(resolveArtifact(from, { tv: samsung, source: 'stable', log })).rejects.toThrow(
      'the stable release carries no KROMA-tizen-*.wgt',
    );
  });
});
