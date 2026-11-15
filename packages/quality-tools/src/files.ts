import { readFileSync, statSync } from 'node:fs';

const MIB = 1024 * 1024;

export const MAX_LCOV_BYTES = 256 * MIB;
export const MAX_SNAPSHOT_BYTES = 64 * MIB;
export const MAX_SOURCE_BYTES = 4 * MIB;
export const MAX_PIN_BYTES = 64 * 1024;

/** A file's text, refused before it is read when the file is larger than `maxBytes`. */
export function readBounded(path: string, maxBytes: number): string {
  const { size } = statSync(path);
  if (size > maxBytes) {
    throw new Error(`${path} is ${size} bytes, more than the ${maxBytes} this reads`);
  }
  return readFileSync(path, 'utf8');
}
