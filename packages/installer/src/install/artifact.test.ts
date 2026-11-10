import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Television } from '../shared/television';
import {
  availableSources,
  localArtifact,
  type PackageKind,
  rankArtifacts,
  resolveArtifact,
} from './artifact';

const { mtimes, globbed, releaseAssets, fetchAsset } = vi.hoisted(() => ({
  mtimes: new Map<string, number>(),
  globbed: new Map<string, string[]>(),
  releaseAssets: vi.fn(),
  fetchAsset: vi.fn(),
}));

vi.mock('node:fs', () => ({
  statSync: (path: string) => ({ mtimeMs: mtimes.get(path) ?? 0 }),
}));
vi.mock('../shared/root', () => ({ root: '/kroma' }));
vi.mock('./matching-paths', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  matchingPaths: (base: string, pattern: string) =>
    (globbed.get(pattern) ?? []).map((name) => join(base, name)),
}));
vi.mock('./release', () => ({ releaseAssets, fetchAsset }));

const wgt: PackageKind = {
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

const asset = (name: string, updated: string) => ({
  name,
  url: `https://github.com/kromatv/kroma/releases/download/x/${name}`,
  size: 10,
  sha256: 'a'.repeat(64),
  updatedMs: Date.parse(updated),
});

beforeEach(() => {
  globbed.clear();
  mtimes.clear();
  lines.length = 0;
  releaseAssets.mockResolvedValue([]);
  fetchAsset.mockImplementation(async (found: { name: string }, directory: string) =>
    join(directory, found.name),
  );
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

  it('offers both release channels where nothing is built and nothing can be', () => {
    expect(availableSources(wgt, false)).toEqual(['stable', 'canary']);
  });
});

describe('resolveArtifact', () => {
  const from = { id: 'tizen', kind: wgt, build: vi.fn() };

  it('takes the package it was given over anything else', async () => {
    const path = await resolveArtifact(from, { tv: samsung, given: '/tmp/KROMA.wgt', log });

    expect(path).toBe('/tmp/KROMA.wgt');
    expect(from.build).not.toHaveBeenCalled();
    expect(releaseAssets).not.toHaveBeenCalled();
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
    releaseAssets.mockResolvedValue([asset('KROMA-tizen-0.1.33.wgt', '2026-11-01T10:00:00Z')]);

    const path = await resolveArtifact(from, { tv: samsung, log });

    expect(releaseAssets).toHaveBeenCalledWith('stable');
    expect(path).toBe(join(downloads, 'stable', 'tizen', 'KROMA-tizen-0.1.33.wgt'));
    expect(lines).toEqual(['package: KROMA-tizen-0.1.33.wgt, from the stable release']);
  });

  it('reads the canary release when the canary channel is the one asked for', async () => {
    releaseAssets.mockResolvedValue([asset('KROMA-tizen-0.1.34.wgt', '2026-11-01T10:00:00Z')]);

    const path = await resolveArtifact(from, { tv: samsung, source: 'canary', log });

    expect(releaseAssets).toHaveBeenCalledWith('canary');
    expect(path).toBe(join(downloads, 'canary', 'tizen', 'KROMA-tizen-0.1.34.wgt'));
  });

  it('takes the newest of the builds a rolling release keeps', async () => {
    releaseAssets.mockResolvedValue([
      asset('KROMA-tizen-0.1.39-canary.3588383.wgt', '2026-11-08T10:00:00Z'),
      asset('KROMA-tizen-0.1.39-canary.3592322.wgt', '2026-11-10T10:00:00Z'),
      asset('KROMA-tizen-0.1.39-canary.3589132.wgt', '2026-11-09T10:00:00Z'),
    ]);

    const path = await resolveArtifact(from, { tv: samsung, source: 'canary', log });

    expect(path).toBe(join(downloads, 'canary', 'tizen', 'KROMA-tizen-0.1.39-canary.3592322.wgt'));
  });

  it('passes over the packages of every other platform in the release', async () => {
    releaseAssets.mockResolvedValue([
      asset('KROMA-androidtv-0.1.33.apk', '2026-11-02T10:00:00Z'),
      asset('KROMA-tizen8-0.1.33.wgt', '2026-11-02T10:00:00Z'),
      asset('KROMA-tizen-0.1.33.wgt', '2026-11-01T10:00:00Z'),
    ]);

    const path = await resolveArtifact(from, { tv: samsung, source: 'stable', log });

    expect(path).toBe(join(downloads, 'stable', 'tizen', 'KROMA-tizen-0.1.33.wgt'));
  });

  it('refuses a release that carried no package of that kind', async () => {
    releaseAssets.mockResolvedValue([asset('KROMA-androidtv-0.1.33.apk', '2026-11-02T10:00:00Z')]);

    await expect(resolveArtifact(from, { tv: samsung, source: 'stable', log })).rejects.toThrow(
      'the stable release carries no KROMA-tizen-*.wgt: gh run download -n kroma-tizen-wgt takes one from a build',
    );
  });
});
