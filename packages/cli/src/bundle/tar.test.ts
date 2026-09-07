import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, zstdCompressSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { deterministicTar, tarNames, tarRead, toTar } from './tar';

const staging = mkdtempSync(join(tmpdir(), 'kroma-tar-'));
afterAll(() => rmSync(staging, { recursive: true, force: true }));

mkdirSync(join(staging, 'fe', 'assets'), { recursive: true });
writeFileSync(join(staging, 'module.json'), '{"id":"tv.kroma.notes"}');
writeFileSync(join(staging, 'module'), 'ELF');
writeFileSync(join(staging, 'icon.svg'), '<svg/>');
writeFileSync(join(staging, 'fe', 'remoteEntry.js'), 'export default 1;');
writeFileSync(join(staging, 'fe', 'assets', 'chunk.js'), 'export const a = 1;');

const ENTRIES = ['module.json', 'module', 'icon.svg', 'fe'];

const text = (bytes: Uint8Array | null) => (bytes ? new TextDecoder().decode(bytes) : null);

interface Header {
  mode: number;
  uid: number;
  gid: number;
  mtime: number;
}

function headers(tar: Uint8Array): Record<string, Header> {
  const field = (off: number, len: number) =>
    new TextDecoder().decode(tar.subarray(off, off + len)).split('\0')[0] ?? '';
  const octal = (off: number, len: number) => Number.parseInt(field(off, len) || '0', 8);
  const out: Record<string, Header> = {};
  let off = 0;
  while (off + 512 <= tar.length) {
    const name = field(off, 100);
    if (!name) break;
    out[name] = {
      mode: octal(off + 100, 8),
      uid: octal(off + 108, 8),
      gid: octal(off + 116, 8),
      mtime: octal(off + 136, 12),
    };
    off += 512 + Math.ceil(octal(off + 124, 12) / 512) * 512;
  }
  return out;
}

function modes(tar: Uint8Array): Record<string, number> {
  return Object.fromEntries(Object.entries(headers(tar)).map(([name, h]) => [name, h.mode]));
}

describe('deterministicTar', () => {
  it('walks the entries in code-unit order, a directory before what is inside it', () => {
    const tar = deterministicTar(staging, ENTRIES);

    expect(tarNames(tar)).toEqual([
      'fe/',
      'fe/assets/',
      'fe/assets/chunk.js',
      'fe/remoteEntry.js',
      'icon.svg',
      'module',
      'module.json',
    ]);
  });

  it('makes the sidecar executable and leaves every other file readable', () => {
    const tar = deterministicTar(staging, ENTRIES);

    expect(modes(tar)).toEqual({
      'fe/': 0o755,
      'fe/assets/': 0o755,
      'fe/assets/chunk.js': 0o644,
      'fe/remoteEntry.js': 0o644,
      'icon.svg': 0o644,
      module: 0o755,
      'module.json': 0o644,
    });
  });

  it('closes the archive on the two zero blocks a reader stops at', () => {
    const tar = deterministicTar(staging, ENTRIES);

    expect(tar.length % 512).toBe(0);
    expect(tar.subarray(tar.length - 1024).every((b) => b === 0)).toBe(true);
  });

  it('pads a short file up to the block, and adds nothing to one that fills it', () => {
    writeFileSync(join(staging, 'block.bin'), 'x'.repeat(512));

    const exact = deterministicTar(staging, ['block.bin']);
    const short = deterministicTar(staging, ['module.json']);

    expect(exact).toHaveLength(512 * 4);
    expect(short).toHaveLength(512 * 4);
  });

  it('packs the same tree to the same bytes twice', () => {
    expect(deterministicTar(staging, ENTRIES)).toEqual(deterministicTar(staging, ENTRIES));
  });

  it('stamps no owner and no clock, so every runner writes one sha256', () => {
    for (const header of Object.values(headers(deterministicTar(staging, ENTRIES)))) {
      expect([header.uid, header.gid, header.mtime]).toEqual([0, 0, 0]);
    }
  });

  it('refuses a name a ustar header cannot hold', () => {
    const long = 'x'.repeat(101);
    writeFileSync(join(staging, long), '');

    expect(() => deterministicTar(staging, [long])).toThrow(/too long for a ustar header/);
  });
});

describe('tarRead', () => {
  it('gives back the bytes of the entry it was asked for', () => {
    const tar = deterministicTar(staging, ENTRIES);

    expect(text(tarRead(tar, 'module.json'))).toBe('{"id":"tv.kroma.notes"}');
    expect(text(tarRead(tar, 'fe/remoteEntry.js'))).toBe('export default 1;');
  });

  it('finds an entry an archiver wrote with a leading ./', () => {
    const tar = deterministicTar(staging, ['./module.json']);

    expect(text(tarRead(tar, 'module.json'))).toBe('{"id":"tv.kroma.notes"}');
  });

  it('is null for an entry the archive does not carry', () => {
    const tar = deterministicTar(staging, ENTRIES);

    expect(tarRead(tar, 'icon.png')).toBeNull();
  });
});

describe('toTar', () => {
  it('unwraps zstd, gzip and a bare tar alike', () => {
    const tar = deterministicTar(staging, ['module.json']);
    const wrapped = [new Uint8Array(zstdCompressSync(tar)), new Uint8Array(gzipSync(tar)), tar];

    expect(wrapped.map((b) => tarNames(toTar(b)))).toEqual([
      ['module.json'],
      ['module.json'],
      ['module.json'],
    ]);
  });
});
