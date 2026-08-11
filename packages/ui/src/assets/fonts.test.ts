import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fontsCss } from '../../vite/tokens.ts';

const DIR = fileURLToPath(new URL('./fonts/', import.meta.url));

const GLYF = 10;
const LOCA = 11;
const FVAR = 47;
const ARBITRARY_TAG = 63;

function base128(buf: Buffer, at: { i: number }): number {
  let value = 0;
  for (let n = 0; n < 5; n++) {
    const byte = buf[at.i++] as number;
    value = ((value << 7) | (byte & 0x7f)) >>> 0;
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error('malformed UIntBase128');
}

function fvarAxes(file: string): Record<string, [number, number]> {
  const buf = readFileSync(file);
  const at = { i: 48 };
  const lengths: { index: number; length: number }[] = [];
  for (let t = buf.readUInt16BE(12); t > 0; t--) {
    const flags = buf[at.i++] as number;
    const index = flags & 0x3f;
    if (index === ARBITRARY_TAG) at.i += 4;
    const version = (flags >> 6) & 0x03;
    const original = base128(buf, at);
    const transformed = (index === GLYF || index === LOCA ? version === 3 : version === 0)
      ? original
      : base128(buf, at);
    lengths.push({ index, length: transformed });
  }

  const tables = brotliDecompressSync(buf.subarray(at.i, at.i + buf.readUInt32BE(20)));
  let offset = 0;
  for (const { index, length } of lengths) {
    if (index !== FVAR) {
      offset += length;
      continue;
    }
    const fvar = tables.subarray(offset, offset + length);
    const first = fvar.readUInt16BE(4);
    const size = fvar.readUInt16BE(10);
    const axes: Record<string, [number, number]> = {};
    for (let a = fvar.readUInt16BE(8); a > 0; a--) {
      const o = first + (a - 1) * size;
      axes[fvar.toString('ascii', o, o + 4)] = [
        fvar.readInt32BE(o + 4) / 65536,
        fvar.readInt32BE(o + 12) / 65536,
      ];
    }
    return axes;
  }
  throw new Error(`${file}: no fvar table`);
}

describe('the shipped woff2 faces', () => {
  const declared = [...fontsCss().matchAll(/font-weight:\s*(\d+)\s+(\d+);/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
  const faces = readdirSync(DIR).filter((f) => f.endsWith('.woff2'));

  it('are all declared with one weight range', () => {
    expect(faces).toHaveLength(4);
    expect(declared).toHaveLength(4);
    expect(new Set(declared.map(String)).size).toBe(1);
  });

  it.each(faces)('%s carries no weight the stylesheet cannot reach', (face) => {
    expect(fvarAxes(`${DIR}${face}`).wght).toEqual(declared[0]);
  });

  it('keeps the optical-size axis Bricolage renders with', () => {
    expect(fvarAxes(`${DIR}bricolage-grotesque-latin.woff2`).opsz).toEqual([12, 96]);
  });
});
