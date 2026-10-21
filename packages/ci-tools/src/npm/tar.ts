import { gunzipSync } from 'node:zlib';
import type { PackageFiles } from './content-hash';

const BLOCK = 512;

function text(block: Uint8Array, start: number, length: number): string {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return new TextDecoder().decode(end === -1 ? raw : raw.subarray(0, end));
}

function paxPath(body: Uint8Array): string | undefined {
  const line = new TextDecoder()
    .decode(body)
    .split('\n')
    .find((entry) => entry.includes(' path='));
  return line?.slice(line.indexOf(' path=') + ' path='.length);
}

/** The regular files of an npm tarball, keyed by path with the leading
 *  `package/` directory removed. */
export function readTarball(gzipped: Uint8Array): PackageFiles {
  const tar = gunzipSync(gzipped);
  const files = new Map<string, Uint8Array>();
  let override: string | undefined;
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(text(header, 124, 12).trim() || '0', 8);
    const type = String.fromCodePoint(header[156] || 48);
    const body = tar.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'x') override = paxPath(body);
    else if (type === 'L') override = text(body, 0, body.length);
    else if (type === '0') {
      const prefix = text(header, 345, 155);
      const name =
        override ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100));
      override = undefined;
      files.set(name.split('/').slice(1).join('/'), body.slice());
    }
  }
  return files;
}
