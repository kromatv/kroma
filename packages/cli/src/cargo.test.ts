import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildSidecar, cargoBuild, targetDir } from './cargo';
import type { Project } from './project';

const work = mkdtempSync(join(tmpdir(), 'kroma-cargo-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

const project = (dir: string): Project => ({
  dir,
  manifest: { schemaVersion: 2, id: 'tv.kroma.notes', name: 'Notes', version: '1.2.0' },
  server: null,
  ui: null,
});

const withCrate = (dir: string): Project => ({
  ...project(dir),
  server: { dir: join(dir, 'server'), crate: 'kroma-notes', bin: 'module', features: [] },
});

describe('targetDir', () => {
  it('takes KMOD_TARGET_DIR over anything it would work out', () => {
    vi.stubEnv('KMOD_TARGET_DIR', '/build/kmod');

    expect(targetDir('/work', [project('/work')])).toBe('/build/kmod');
  });

  it("leaves the module the cwd is with cargo's own server/target", () => {
    vi.stubEnv('KMOD_TARGET_DIR', undefined);

    expect(targetDir('/work/tv.kroma.notes', [project('/work/tv.kroma.notes')])).toBe(
      join('/work/tv.kroma.notes', 'server/target'),
    );
  });

  it('gives every other run one directory, so a shared dependency compiles once', () => {
    vi.stubEnv('KMOD_TARGET_DIR', undefined);

    expect(targetDir('/work', [project('/work/modules/a'), project('/work/modules/b')])).toBe(
      join('/work', 'target/kmod'),
    );
    expect(targetDir('/work', [project('/work/modules/a')])).toBe(join('/work', 'target/kmod'));
  });
});

describe('cargoBuild', () => {
  it('names the features bare and leaves the binary under the triple', () => {
    const built = cargoBuild(
      'module',
      ['local', 'gpu'],
      'aarch64-apple-darwin',
      'release-kmod',
      '/target',
    );

    expect(built.args).toEqual([
      'build',
      '--bin',
      'module',
      '--profile',
      'release-kmod',
      '--features',
      'local,gpu',
      '--target',
      'aarch64-apple-darwin',
    ]);
    expect(built.binPath).toBe(join('/target', 'aarch64-apple-darwin', 'release-kmod', 'module'));
  });

  it('builds a dev sidecar with nothing but the binary, into debug', () => {
    const built = cargoBuild('module', [], null, 'dev', '/target');

    expect(built.args).toEqual(['build', '--bin', 'module']);
    expect(built.binPath).toBe(join('/target', 'debug', 'module'));
  });
});

describe('buildSidecar', () => {
  it('builds nothing for a library module, which spawns no process', async () => {
    const options = { target: null, profile: 'dev' } as const;
    const library = { ...withCrate('/work'), server: { ...withCrate('/work').server, bin: null } };

    await expect(buildSidecar(library as Project, '/target', options)).resolves.toBeNull();
  });

  it('builds nothing for a module with no server crate', async () => {
    const options = { target: null, profile: 'dev' } as const;

    await expect(buildSidecar(project('/work'), '/target', options)).resolves.toBeNull();
  });

  it('locates a binary built out of band instead of building it again', async () => {
    const dir = join(work, 'prebuilt');
    mkdirSync(join(dir, 'debug'), { recursive: true });
    writeFileSync(join(dir, 'debug', 'module'), 'ELF');

    const built = await buildSidecar(withCrate('/work'), dir, {
      target: null,
      profile: 'dev',
      skipBuild: true,
    });

    expect(built).toBe(join(dir, 'debug', 'module'));
  });

  it('says where the prebuilt binary was meant to be when it is missing', async () => {
    const options = { target: null, profile: 'dev', skipBuild: true } as const;

    await expect(buildSidecar(withCrate('/work'), join(work, 'empty'), options)).rejects.toThrow(
      /KMOD_SKIP_BUILD is set but there is no prebuilt binary/,
    );
  });
});
