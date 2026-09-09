import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemaPath } from '@kromatv/registry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packBundle } from '../bundle/pack';
import { registryCommand, resolveDir } from './registry';

let dir: string;

function pack(id: string, version: string, outDir = join(dir, 'dist', 'modules')): void {
  const project = join(dir, 'modules', id);
  mkdirSync(project, { recursive: true });
  const manifest = { schemaVersion: 2, id, name: id, version, library: true };
  writeFileSync(join(project, 'module.json'), JSON.stringify(manifest));
  writeFileSync(join(project, 'icon.svg'), '<svg/>');
  packBundle({
    project: { dir: project, manifest, server: null, ui: null },
    binPath: null,
    feDir: null,
    outDir,
    target: null,
  });
}

function written<T>(rel: string, outDir = join(dir, 'dist', 'registry')): T {
  return JSON.parse(readFileSync(join(outDir, rel), 'utf8')) as T;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kroma-registry-'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveDir', () => {
  it('falls back to the default under the cwd when nothing was given', () => {
    expect(resolveDir(undefined, 'dist/modules', '/work')).toBe(join('/work', 'dist/modules'));
  });

  it('keeps an absolute path and resolves a relative one against the cwd', () => {
    expect(resolveDir('/elsewhere/modules', 'dist/modules', '/work')).toBe('/elsewhere/modules');
    expect(resolveDir('out/modules', 'dist/modules', '/work')).toBe(join('/work', 'out/modules'));
  });
});

describe('registryCommand', () => {
  it('writes the catalog, the descriptor, the index and one record per module, sorted by id', () => {
    pack('tv.acme.b', '0.2.0');
    pack('tv.acme.a', '0.1.0');

    const code = registryCommand({ cwd: dir, base: 'https://modules.kroma.tv' });

    expect(code).toBe(0);
    expect(written<{ schema: number; modules: { id: string }[] }>('catalog.json')).toMatchObject({
      schema: 2,
      modules: [{ id: 'tv.acme.a' }, { id: 'tv.acme.b' }],
    });
    expect(written<{ url: string; modules: string[] }>('registry.json')).toMatchObject({
      url: 'https://modules.kroma.tv',
      modules: ['tv.acme.a', 'tv.acme.b'],
    });
    expect(written<{ id: string }[]>('index.json').map((e) => e.id)).toEqual([
      'tv.acme.a',
      'tv.acme.b',
    ]);
    expect(written<{ latest: string }>('m/tv.acme.b.json').latest).toBe('0.2.0');
  });

  it('copies every bundle byte for byte beside the documents it describes', () => {
    pack('tv.acme.a', '0.1.0');

    registryCommand({ cwd: dir, base: 'https://modules.kroma.tv' });

    expect(readFileSync(join(dir, 'dist', 'registry', 'tv.acme.a.kmod'))).toEqual(
      readFileSync(join(dir, 'dist', 'modules', 'tv.acme.a.kmod')),
    );
  });

  it('publishes each schema at its versioned path and again under its bare name', () => {
    pack('tv.acme.a', '0.1.0');

    registryCommand({ cwd: dir, base: 'https://modules.kroma.tv' });

    for (const name of ['manifest', 'registry', 'index', 'module'] as const) {
      const versioned = schemaPath(name).replace(/^\//, '');
      expect(written<{ $id: string }>(versioned).$id).toBe(
        `https://modules.kroma.tv${schemaPath(name)}`,
      );
      expect(written<{ $id: string }>(`schemas/${name}.json`)).toEqual(
        written<{ $id: string }>(versioned),
      );
    }
  });

  it('strips a trailing slash off the base URL it was given', () => {
    pack('tv.acme.a', '0.1.0');

    registryCommand({ cwd: dir, base: 'https://modules.kroma.tv/' });

    expect(written<{ url: string }>('registry.json').url).toBe('https://modules.kroma.tv');
    const [entry] = written<{ artifacts: { url: string }[] }[]>('index.json');
    expect(entry?.artifacts[0]?.url).toBe('https://modules.kroma.tv/tv.acme.a.kmod');
  });

  it('leaves an artifact URL as a bare filename when no base was given', () => {
    pack('tv.acme.a', '0.1.0');

    registryCommand({ cwd: dir });

    const [entry] = written<{ artifacts: { url: string }[] }[]>('index.json');
    expect(entry?.artifacts[0]?.url).toBe('tv.acme.a.kmod');
  });

  it('reads from the directory --from names and writes into the one --out names', () => {
    pack('tv.acme.a', '0.1.0', join(dir, 'packed'));

    registryCommand({ cwd: dir, from: 'packed', out: join(dir, 'site') });

    expect(existsSync(join(dir, 'site', 'catalog.json'))).toBe(true);
    expect(existsSync(join(dir, 'site', 'tv.acme.a.kmod'))).toBe(true);
  });
});
