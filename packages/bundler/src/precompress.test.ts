import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { precompress } from './precompress';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kroma-precompress-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function file(name: string, bytes: number): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, 'console.log("kroma");\n'.repeat(Math.ceil(bytes / 22)).slice(0, bytes));
  return path;
}

describe('precompress', () => {
  it('writes a brotli and a gzip copy that decompress to the source', async () => {
    const script = await file('index-A1b2C3d4.js', 4096);

    const { assets, saved } = await precompress([script]);

    const source = await readFile(script);
    expect(brotliDecompressSync(await readFile(`${script}.br`))).toEqual(source);
    expect(gunzipSync(await readFile(`${script}.gz`))).toEqual(source);
    expect(assets).toBe(1);
    expect(saved).toBeGreaterThan(0);
  });

  it('leaves a file under 1 KiB and a file it cannot shrink alone', async () => {
    const small = await file('tiny.css', 200);
    const image = await file('poster.webp', 4096);

    const { assets } = await precompress([small, image]);

    expect(assets).toBe(0);
    for (const path of [small, image]) {
      expect(existsSync(`${path}.br`)).toBe(false);
      expect(existsSync(`${path}.gz`)).toBe(false);
    }
  });
});
