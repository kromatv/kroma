import { readFile, stat } from 'node:fs/promises';
import { gunzipSync } from 'fflate';
import { z } from 'zod';

const AR_MAGIC = '!<arch>\n';
const AR_HEADER_BYTES = 60;
const TAR_BLOCK_BYTES = 512;
const CONTROL_ARCHIVE = 'control.tar.gz';
const CONTROL_FILE = 'control';
const MAX_IPK_BYTES = 512 * 1024 * 1024;
const MAX_CONTROL_BYTES = 1024 * 1024;

const AppId = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,127}$/);

/**
 * The id of the app an `.ipk` installs, read from the `Package:` line of its
 * control file: `tv.kroma.app` for the native app, `tv.kroma.webos` for the
 * web one. It reaches the set's shell, so anything but a plain id is refused.
 */
export async function ipkAppId(path: string): Promise<string> {
  if ((await stat(path)).size > MAX_IPK_BYTES)
    throw new Error(`${path} is too large to be an .ipk`);
  const control = tarFile(
    gunzipBounded(arMember(await readFile(path), CONTROL_ARCHIVE)),
    CONTROL_FILE,
  );
  const named = /^Package:[ \t]*(\S+)[ \t]*$/m.exec(Buffer.from(control).toString('utf8'))?.[1];
  const parsed = AppId.safeParse(named);
  if (!parsed.success) throw new Error(`${path} names no usable app id in its control file`);
  return parsed.data;
}

function arMember(archive: Uint8Array, wanted: string): Uint8Array {
  const bytes = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
  if (bytes.toString('latin1', 0, AR_MAGIC.length) !== AR_MAGIC) throw new Error('not an .ipk');
  let at = AR_MAGIC.length;
  while (at + AR_HEADER_BYTES <= bytes.length) {
    const name = bytes
      .toString('latin1', at, at + 16)
      .trim()
      .replace(/\/$/, '');
    const size = Number.parseInt(bytes.toString('latin1', at + 48, at + 58).trim(), 10);
    const start = at + AR_HEADER_BYTES;
    if (!Number.isSafeInteger(size) || size < 0 || start + size > bytes.length) break;
    if (name === wanted) return bytes.subarray(start, start + size);
    at = start + size + (size % 2);
  }
  throw new Error(`the .ipk holds no ${wanted}`);
}

function gunzipBounded(gzip: Uint8Array): Uint8Array {
  if (gzip.length < 4) throw new Error(`the .ipk's ${CONTROL_ARCHIVE} is empty`);
  const declared = Buffer.from(gzip.buffer, gzip.byteOffset, gzip.byteLength).readUInt32LE(
    gzip.length - 4,
  );
  if (gzip.length > MAX_CONTROL_BYTES || declared > MAX_CONTROL_BYTES) {
    throw new Error(`the .ipk's ${CONTROL_ARCHIVE} is too large`);
  }
  return gunzipSync(gzip);
}

function tarFile(tar: Uint8Array, wanted: string): Uint8Array {
  const bytes = Buffer.from(tar.buffer, tar.byteOffset, tar.byteLength);
  let at = 0;
  while (at + TAR_BLOCK_BYTES <= bytes.length) {
    const name = beforeNul(bytes.toString('utf8', at, at + 100));
    if (name === '') break;
    const size = Number.parseInt(beforeNul(bytes.toString('latin1', at + 124, at + 136)).trim(), 8);
    const start = at + TAR_BLOCK_BYTES;
    if (!Number.isSafeInteger(size) || size < 0 || start + size > bytes.length) break;
    if (name.replace(/^\.\//, '') === wanted) return bytes.subarray(start, start + size);
    at = start + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
  }
  throw new Error(`the .ipk's ${CONTROL_ARCHIVE} holds no ${wanted}`);
}

function beforeNul(field: string): string {
  const end = field.indexOf('\0');
  return end === -1 ? field : field.slice(0, end);
}
