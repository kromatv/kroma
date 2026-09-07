import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tarNames, toTar } from '../bundle/tar';
import { buildCommand, feOutDir } from './build';

let dir: string;

function libraryModule(root: string, id: string): string {
  const project = join(root, 'modules', id);
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, 'module.json'),
    JSON.stringify({ schemaVersion: 2, id, name: id, version: '0.1.0', library: true }),
  );
  writeFileSync(join(project, 'icon.svg'), '<svg/>');
  return project;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kroma-build-'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('buildCommand', () => {
  it('packs every library module under modules/ into dist/modules with sidecars', async () => {
    libraryModule(dir, 'tv.acme.b');
    libraryModule(dir, 'tv.acme.a');

    const code = await buildCommand({ dirs: [], cwd: dir });

    expect(code).toBe(0);
    for (const id of ['tv.acme.a', 'tv.acme.b']) {
      const kmod = join(dir, 'dist', 'modules', `${id}.kmod`);
      expect(existsSync(kmod)).toBe(true);
      expect(readFileSync(`${kmod}.sha256`, 'utf8')).toMatch(
        new RegExp(`^[0-9a-f]{64}  ${id}.kmod\\n$`),
      );
      const bytes = readFileSync(kmod);
      const names = tarNames(
        toTar(new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)),
      );
      expect(names).toEqual(['icon.svg', 'module.json']);
    }
  });

  it('packs one given module into the directory asked for, without a target suffix', async () => {
    const project = libraryModule(dir, 'tv.acme.solo');
    const out = join(dir, 'elsewhere');

    await buildCommand({ dirs: [project], out, target: 'x86_64-unknown-linux-musl', cwd: dir });

    expect(existsSync(join(out, 'tv.acme.solo.kmod'))).toBe(true);
    expect(existsSync(feOutDir({ dir: project } as never))).toBe(false);
  });

  it('leaves an unchanged bundle alone on a second run', async () => {
    libraryModule(dir, 'tv.acme.same');
    await buildCommand({ dirs: [], cwd: dir });
    const log = vi.mocked(console.log);
    log.mockClear();

    await buildCommand({ dirs: [], cwd: dir });

    expect(log.mock.calls.some(([line]) => String(line).includes('unchanged:'))).toBe(true);
  });
});
