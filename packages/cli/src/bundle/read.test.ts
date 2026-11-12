import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../project';
import { packBundle } from './pack';
import { type Bundle, readBundle, readBundles, toEntries } from './read';
import { toTar } from './tar';

const work = mkdtempSync(join(tmpdir(), 'kroma-read-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

const MANIFEST = { schemaVersion: 3, id: 'tv.kroma.notes', name: 'Notes', version: '1.2.0' };

let made = 0;

const dist = () => {
  made += 1;
  return join(work, `dist-${made}`);
};

interface Shipped {
  id?: string;
  moduleJson?: unknown;
  icon?: 'icon.svg' | 'icon.png' | null;
}

function pack(outDir: string, shipped: Shipped = {}): string {
  made += 1;
  const dir = join(work, `module-${made}`);
  mkdirSync(dir, { recursive: true });
  const manifest = { ...MANIFEST, id: shipped.id ?? MANIFEST.id };
  writeFileSync(join(dir, 'module.json'), JSON.stringify(shipped.moduleJson ?? manifest));
  const icon = shipped.icon === undefined ? 'icon.svg' : shipped.icon;
  if (icon) writeFileSync(join(dir, icon), icon === 'icon.svg' ? '<svg/>' : 'PNG');
  writeFileSync(join(dir, 'module.wasm'), '\0asm');
  const project: Project = { dir, manifest, server: null, ui: null };
  return packBundle({ project, binPath: join(dir, 'module.wasm'), feDir: null, outDir }).path;
}

describe('readBundle', () => {
  it('describes a bundle by the manifest packed inside it', () => {
    const path = pack(dist());

    const bundle = readBundle(path);

    expect(bundle).toMatchObject({
      file: 'tv.kroma.notes.kmod',
      manifest: { id: 'tv.kroma.notes', version: '1.2.0' },
      size: statSync(path).size,
    });
  });

  it('skips a bundle not named after the module it holds, a platform suffix included', () => {
    const path = pack(dist());
    const renamed = join(dirname(path), 'tv.kroma.notes-aarch64-apple-darwin.kmod');
    renameSync(path, renamed);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const bundle = readBundle(renamed);

    expect(bundle).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('packs as tv.kroma.notes.kmod'));
  });

  it('hashes the compressed bundle and the tar inside it apart', () => {
    const path = pack(dist());

    const bundle = readBundle(path);

    const bytes = new Uint8Array(readFileSync(path));
    expect(bundle?.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(bundle?.contentHash).toBe(createHash('sha256').update(toTar(bytes)).digest('hex'));
  });

  it('carries the icon as a data URI', () => {
    const path = pack(dist(), { icon: 'icon.svg' });

    expect(readBundle(path)?.icon).toBe(
      `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
    );
  });

  it('falls back to a png, and has no icon when the module draws neither', () => {
    const png = pack(dist(), { icon: 'icon.png' });
    const bare = pack(dist(), { icon: null });

    expect(readBundle(png)?.icon).toMatch(/^data:image\/png;base64,/);
    expect(readBundle(bare)?.icon).toBeUndefined();
  });

  it('skips a file that is not a bundle at all', () => {
    const out = dist();
    mkdirSync(out, { recursive: true });
    const path = join(out, 'notes.kmod');
    writeFileSync(path, 'nothing like a tar');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const bundle = readBundle(path);

    expect(bundle).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no module.json inside'));
  });

  it('skips a bundle whose module.json is not a manifest', () => {
    const path = pack(dist(), { moduleJson: { name: 'Notes' } });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const bundle = readBundle(path);

    expect(bundle).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not a manifest'));
  });

  it('skips a bundle built against a manifest schema this build does not speak', () => {
    const older = pack(dist(), { moduleJson: { ...MANIFEST, schemaVersion: 1 } });
    const unversioned = pack(dist(), { moduleJson: { ...MANIFEST, schemaVersion: undefined } });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = [readBundle(older), readBundle(unversioned)];

    expect(read).toEqual([null, null]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('manifest schema v1'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('manifest schema v0'));
  });
});

describe('readBundles', () => {
  it('reads the bundles in filename order, dropping what it cannot open', () => {
    const out = dist();
    pack(out, { id: 'tv.kroma.vpn' });
    pack(out, { id: 'tv.kroma.notes' });
    writeFileSync(join(out, 'notes.txt'), 'not a bundle');
    writeFileSync(join(out, 'zz.broken.kmod'), 'nothing like a tar');

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const bundles = readBundles(out);

    expect(bundles.map((b) => b.file)).toEqual(['tv.kroma.notes.kmod', 'tv.kroma.vpn.kmod']);
  });

  it('refuses a directory nothing was packed into', () => {
    expect(() => readBundles(join(work, 'never-built'))).toThrow(/kroma build/);
  });
});

describe('toEntries', () => {
  const bundle = (id: string, icon?: string): Bundle => ({
    manifest: { ...MANIFEST, id },
    file: `${id}.kmod`,
    path: `/dist/${id}.kmod`,
    size: 10,
    sha256: `sha-${id}`,
    contentHash: `tar-${id}`,
    icon,
  });

  const base = () => 'https://modules.kroma.tv/';

  it('gives a module one entry holding its one bundle', () => {
    const entries = toEntries([bundle('tv.kroma.notes')], base);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.artifacts).toEqual([
      {
        file: 'tv.kroma.notes.kmod',
        url: 'https://modules.kroma.tv/tv.kroma.notes.kmod',
        size: 10,
        sha256: 'sha-tv.kroma.notes',
        contentHash: 'tar-tv.kroma.notes',
      },
    ]);
  });

  it('mirrors the artifact onto the entry, for a reader that knows one build', () => {
    const entries = toEntries([bundle('tv.kroma.notes')], base);

    expect(entries[0]).toMatchObject({
      file: 'tv.kroma.notes.kmod',
      url: 'https://modules.kroma.tv/tv.kroma.notes.kmod',
      size: 10,
      sha256: 'sha-tv.kroma.notes',
    });
  });

  it('sorts the modules by id, and leaves a filename bare when there is no base', () => {
    const builds = [bundle('tv.kroma.vpn'), bundle('tv.kroma.notes')];

    const entries = toEntries(builds, () => '');

    expect(entries.map((e) => e.id)).toEqual(['tv.kroma.notes', 'tv.kroma.vpn']);
    expect(entries[0]?.url).toBe('tv.kroma.notes.kmod');
  });

  it('carries the icon the bundle ships', () => {
    const entries = toEntries(
      [bundle('tv.kroma.notes', 'data:image/svg+xml;base64,PHN2Zy8+')],
      base,
    );

    expect(entries[0]?.icon).toBe('data:image/svg+xml;base64,PHN2Zy8+');
  });

  it('refuses two bundles of one module, which would make two artifacts of one entry', () => {
    const twin = { ...bundle('tv.kroma.notes'), file: 'copy.kmod' };

    expect(() => toEntries([bundle('tv.kroma.notes'), twin], base)).toThrow(
      'tv.kroma.notes.kmod and copy.kmod both hold tv.kroma.notes',
    );
  });
});
