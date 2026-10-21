import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readTarball } from './tar';

const enc = new TextEncoder();

function entry(name: string, body: string, type = '0', prefix = ''): Uint8Array {
  const header = new Uint8Array(512);
  header.set(enc.encode(name), 0);
  header.set(enc.encode(`${body.length.toString(8).padStart(11, '0')}\0`), 124);
  header[156] = type.charCodeAt(0);
  header.set(enc.encode(prefix), 345);
  const data = new Uint8Array(Math.ceil(body.length / 512) * 512);
  data.set(enc.encode(body));
  return Buffer.concat([header, data]);
}

function tgz(...entries: Uint8Array[]): Uint8Array {
  return gzipSync(Buffer.concat([...entries, new Uint8Array(1024)]));
}

const text = (files: ReadonlyMap<string, Uint8Array>, path: string) =>
  new TextDecoder().decode(files.get(path));

describe('readTarball', () => {
  it('keys regular files without the package directory', () => {
    const files = readTarball(
      tgz(entry('package/package.json', '{}'), entry('package/dist/a.js', 'a')),
    );

    expect([...files.keys()]).toEqual(['package.json', 'dist/a.js']);
    expect(text(files, 'dist/a.js')).toBe('a');
  });

  it('skips directories', () => {
    const files = readTarball(tgz(entry('package/dist/', '', '5'), entry('package/x', 'x')));

    expect([...files.keys()]).toEqual(['x']);
  });

  it('joins the ustar prefix to the name', () => {
    const files = readTarball(tgz(entry('b.js', 'b', '0', 'package/deep')));

    expect([...files.keys()]).toEqual(['deep/b.js']);
  });

  it('takes a long path from a pax header', () => {
    const record = ' path=package/long/name.js\n';
    const pax = `${String(record.length + 2)}${record}`;
    const files = readTarball(tgz(entry('PaxHeader', pax, 'x'), entry('short', 'z')));

    expect(text(files, 'long/name.js')).toBe('z');
  });

  it('takes a long path from a GNU long-name entry', () => {
    const files = readTarball(
      tgz(entry('././@LongLink', 'package/gnu/name.js\0', 'L'), entry('short', 'g')),
    );

    expect(text(files, 'gnu/name.js')).toBe('g');
  });

  it('keeps a file whose pax header carries no path under its own name', () => {
    const files = readTarball(tgz(entry('PaxHeader', 'junk', 'x'), entry('package/k', 'k')));

    expect(text(files, 'k')).toBe('k');
  });
});
