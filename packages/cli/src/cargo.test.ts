import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildComponent, cargoBuild, COMPONENT_TARGET, targetDir } from './cargo';
import type { Project } from './project';

const exec = vi.hoisted(() => vi.fn());

vi.mock('./exec', () => ({ exec }));

const work = mkdtempSync(join(tmpdir(), 'kroma-cargo-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  exec.mockReset();
});

const project = (dir: string): Project => ({
  dir,
  manifest: { schemaVersion: 3, id: 'tv.kroma.notes', name: 'Notes', version: '1.2.0' },
  server: null,
  ui: null,
});

const withCrate = (dir: string, bin: string | null = 'module'): Project => ({
  ...project(dir),
  server: { dir: join(dir, 'server'), crate: 'kroma-notes', bin, features: [] },
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
  it('names the features bare and builds for the component target', () => {
    const built = cargoBuild('module', ['local', 'gpu'], 'release-kmod', '/target');

    expect(built.args).toEqual([
      'build',
      '--bin',
      'module',
      '--profile',
      'release-kmod',
      '--features',
      'local,gpu',
      '--target',
      'wasm32-wasip2',
    ]);
    expect(built.binPath).toBe(join('/target', COMPONENT_TARGET, 'release-kmod', 'module.wasm'));
  });

  it('builds a dev component with nothing but the binary and the target, into debug', () => {
    const built = cargoBuild('module', [], 'dev', '/target');

    expect(built.args).toEqual(['build', '--bin', 'module', '--target', 'wasm32-wasip2']);
    expect(built.binPath).toBe(join('/target', COMPONENT_TARGET, 'debug', 'module.wasm'));
  });
});

describe('buildComponent', () => {
  it('builds nothing for a library module, which runs nothing', async () => {
    const library = withCrate('/work', null);
    library.manifest.library = true;

    await expect(buildComponent(library, '/target', 'dev')).resolves.toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  it('builds nothing for a module with no server crate', async () => {
    await expect(buildComponent(project('/work'), '/target', 'dev')).resolves.toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses a crate with no binary in a module that is not a library, naming it', async () => {
    await expect(buildComponent(withCrate('/work', null), '/target', 'dev')).rejects.toThrow(
      /tv\.kroma\.notes: server\/Cargo\.toml declares no \[\[bin\]\]/,
    );
  });

  it('builds the component in the crate and hands back the .wasm cargo left', async () => {
    const wasm = join(work, COMPONENT_TARGET, 'release-kmod', 'module.wasm');
    exec.mockImplementation(async () => {
      mkdirSync(dirname(wasm), { recursive: true });
      writeFileSync(wasm, '\0asm');
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const built = await buildComponent(withCrate('/work'), work, 'release-kmod');

    expect(built).toBe(wasm);
    expect(exec).toHaveBeenCalledWith(
      'cargo',
      cargoBuild('module', [], 'release-kmod', work).args,
      expect.objectContaining({ cwd: join('/work', 'server') }),
    );
  });

  it('says which module cargo failed to build', async () => {
    exec.mockResolvedValue({ exitCode: 101 });

    await expect(buildComponent(withCrate('/work'), work, 'dev')).rejects.toThrow(
      'tv.kroma.notes: cargo build failed',
    );
  });

  it('names the module whose build left no component where cargo puts one', async () => {
    exec.mockResolvedValue({ exitCode: 0 });

    await expect(buildComponent(withCrate('/work'), work, 'dev')).rejects.toThrow(
      `tv.kroma.notes: cargo built no component at ${join(work, COMPONENT_TARGET, 'debug', 'module.wasm')}`,
    );
  });
});
