import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Project } from '../project';
import { bundleName, type PackInput, packBundle, packForDev } from './pack';
import { tarNames, tarRead, toTar } from './tar';

const work = mkdtempSync(join(tmpdir(), 'kroma-pack-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let made = 0;

function fixture(): PackInput {
  made += 1;
  const dir = join(work, `notes-${made}`);
  mkdirSync(join(dir, 'fe'), { recursive: true });
  const manifest = { schemaVersion: 3, id: 'tv.kroma.notes', name: 'Notes', version: '1.2.0' };
  writeFileSync(join(dir, 'module.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'icon.svg'), '<svg/>');
  writeFileSync(join(dir, 'kroma-module-notes.wasm'), '\0asm component');
  writeFileSync(join(dir, 'fe', 'remoteEntry.js'), 'export default 1;');
  const project: Project = { dir, manifest, server: null, ui: null };
  return {
    project,
    binPath: join(dir, 'kroma-module-notes.wasm'),
    feDir: join(dir, 'fe'),
    outDir: join(work, `dist-${made}`),
  };
}

const bytesOf = (path: string) => new Uint8Array(readFileSync(path));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('bundleName', () => {
  it('names every bundle after its module id alone, the same for every platform', () => {
    expect(bundleName('tv.kroma.notes')).toBe('tv.kroma.notes.kmod');
  });
});

describe('packBundle', () => {
  it('holds the manifest, the component, the icon and the frontend', () => {
    const input = fixture();

    const packed = packBundle(input);

    expect(packed.file).toBe('tv.kroma.notes.kmod');
    expect(tarNames(toTar(bytesOf(packed.path)))).toEqual([
      'fe/',
      'fe/remoteEntry.js',
      'icon.svg',
      'module.json',
      'module.wasm',
    ]);
  });

  it('packs the component under the one name the server reads, whatever cargo called it', () => {
    const input = fixture();

    const packed = packBundle(input);

    const component = tarRead(toTar(bytesOf(packed.path)), 'module.wasm');
    expect(Buffer.from(component ?? []).toString('utf8')).toBe('\0asm component');
  });

  it('refuses a server build that is not a component, naming the module', () => {
    const input = fixture();
    writeFileSync(join(input.project.dir, 'module'), 'ELF');

    expect(() => packBundle({ ...input, binPath: join(input.project.dir, 'module') })).toThrow(
      /tv\.kroma\.notes: .*module is not a WebAssembly component/,
    );
  });

  it('carries the module’s catalogs, which the server renders its notifications from', () => {
    const input = fixture();
    mkdirSync(join(input.project.dir, 'locales'));
    writeFileSync(join(input.project.dir, 'locales', 'en.json'), '{}');
    writeFileSync(join(input.project.dir, 'locales', 'notes.md'), 'draft');

    const packed = packBundle(input);

    const names = tarNames(toTar(bytesOf(packed.path)));
    expect(names).toContain('locales/en.json');
    expect(names).not.toContain('locales/notes.md');
  });

  it('packs the manifest byte for byte as it was written', () => {
    const input = fixture();

    const packed = packBundle(input);

    const bundled = tarRead(toTar(bytesOf(packed.path)), 'module.json');
    expect(Buffer.from(bundled ?? []).toString('utf8')).toBe(
      readFileSync(join(input.project.dir, 'module.json'), 'utf8'),
    );
  });

  it('leaves nothing staged in the module directory', () => {
    const input = fixture();

    packBundle(input);

    expect(existsSync(join(input.project.dir, '.bundle'))).toBe(false);
  });

  it('writes the hash of the bundle and the hash of the tar beside it', () => {
    const input = fixture();

    const packed = packBundle(input);

    const bytes = bytesOf(packed.path);
    expect(readFileSync(`${packed.path}.sha256`, 'utf8')).toBe(`${sha(bytes)}  ${packed.file}\n`);
    expect(readFileSync(`${packed.path}.tarsha`, 'utf8').trim()).toBe(sha(toTar(bytes)));
  });

  it('leaves the bundle as it is when the tar has not moved', () => {
    const input = fixture();
    const first = packBundle(input);
    const before = bytesOf(first.path);

    const again = packBundle(input);

    expect(again.changed).toBe(false);
    expect(bytesOf(again.path)).toEqual(before);
  });

  it('repacks once a file inside the module changes', () => {
    const input = fixture();
    packBundle(input);
    writeFileSync(join(input.project.dir, 'icon.svg'), '<svg viewBox="0 0 1 1"/>');

    const again = packBundle(input);

    expect(again.changed).toBe(true);
    expect(readFileSync(`${again.path}.tarsha`, 'utf8').trim()).toBe(
      sha(toTar(bytesOf(again.path))),
    );
  });

  it('packs a library module with no component in it, under the same name', () => {
    const input = fixture();

    const packed = packBundle({ ...input, binPath: null });

    expect(packed.file).toBe('tv.kroma.notes.kmod');
    expect(tarNames(toTar(bytesOf(packed.path)))).not.toContain('module.wasm');
  });
});

describe('packForDev', () => {
  it('writes every time, and no hash sidecars, so a dev loop never short-circuits', () => {
    const input = fixture();

    packForDev(input);
    const packed = packForDev(input);

    expect(packed.changed).toBe(true);
    expect(existsSync(`${packed.path}.tarsha`)).toBe(false);
    expect(tarNames(toTar(bytesOf(packed.path)))).toEqual([
      'fe/',
      'fe/remoteEntry.js',
      'icon.svg',
      'module.json',
      'module.wasm',
    ]);
    expect(existsSync(`${packed.path}.sha256`)).toBe(false);
  });
});
