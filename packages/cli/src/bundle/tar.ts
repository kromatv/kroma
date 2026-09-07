import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { byCodeUnit } from '../sort';

const BLOCK = 512;

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function header(name: string, size: number, mode: number, dir: boolean): Uint8Array {
  if (name.length > 100) {
    throw new Error(`tar entry name too long for a ustar header: ${name}`);
  }
  const buf = new Uint8Array(BLOCK);
  const put = (s: string, off: number) => buf.set(new TextEncoder().encode(s), off);
  put(name, 0);
  put(octal(mode, 8), 100);
  put(octal(0, 8), 108);
  put(octal(0, 8), 116);
  put(octal(dir ? 0 : size, 12), 124);
  put(octal(0, 12), 136);
  put('        ', 148);
  put(dir ? '5' : '0', 156);
  put('ustar\0', 257);
  put('00', 263);
  let sum = 0;
  for (const b of buf) sum += b;
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return buf;
}

interface Entry {
  name: string;
  dir: boolean;
  mode: number;
}

function entryList(staging: string, entries: readonly string[]): Entry[] {
  const out: Entry[] = [];
  const walk = (rel: string) => {
    if (statSync(join(staging, rel)).isDirectory()) {
      out.push({ name: `${rel}/`, dir: true, mode: 0o755 });
      for (const child of readdirSync(join(staging, rel)).sort(byCodeUnit)) {
        walk(`${rel}/${child}`);
      }
    } else {
      out.push({ name: rel, dir: false, mode: rel === 'module' ? 0o755 : 0o644 });
    }
  };
  for (const entry of [...entries].sort(byCodeUnit)) walk(entry);
  return out;
}

/**
 * A ustar archive of `entries` under `staging` that is byte-identical on every
 * machine: epoch mtimes, uid/gid 0, code-unit-sorted entries. CI packs the same
 * bundle on several runners and the published sha256 only holds if each copy
 * matches.
 */
export function deterministicTar(staging: string, entries: readonly string[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const e of entryList(staging, entries)) {
    if (e.dir) {
      parts.push(header(e.name, 0, e.mode, true));
      continue;
    }
    const data = readFileSync(join(staging, e.name));
    parts.push(header(e.name, data.length, e.mode, false), data);
    const pad = data.length % BLOCK;
    if (pad) parts.push(new Uint8Array(BLOCK - pad));
  }
  parts.push(new Uint8Array(BLOCK * 2));
  const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return buf;
}

/** One entry's bytes out of a ustar archive, or `null` when it is not there. */
export function tarRead(tar: Uint8Array, wanted: string): Uint8Array | null {
  const field = (start: number, len: number) =>
    new TextDecoder().decode(tar.subarray(start, start + len)).split('\0')[0] ?? '';
  let off = 0;
  while (off + BLOCK <= tar.length) {
    const name = field(off, 100);
    if (!name) break;
    const size = Number.parseInt(field(off + 124, 12).trim() || '0', 8);
    if (name === wanted || name === `./${wanted}`) {
      return tar.subarray(off + BLOCK, off + BLOCK + size);
    }
    off += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return null;
}

/** Every entry name in a ustar archive, in archive order. */
export function tarNames(tar: Uint8Array): string[] {
  const field = (start: number, len: number) =>
    new TextDecoder().decode(tar.subarray(start, start + len)).split('\0')[0] ?? '';
  const names: string[] = [];
  let off = 0;
  while (off + BLOCK <= tar.length) {
    const name = field(off, 100);
    if (!name) break;
    names.push(name);
    const size = Number.parseInt(field(off + 124, 12).trim() || '0', 8);
    off += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return names;
}

/** The tar inside a `.kmod`, whichever way it was compressed. */
export function toTar(buf: Uint8Array): Uint8Array {
  if (buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd) {
    return new Uint8Array(zstdDecompressSync(buf));
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return new Uint8Array(gunzipSync(buf));
  }
  return buf;
}
