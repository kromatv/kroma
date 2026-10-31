import { readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { extname } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

const COMPRESSIBLE = new Set([
  '.js',
  '.ts',
  '.css',
  '.html',
  '.svg',
  '.json',
  '.txt',
  '.map',
  '.webmanifest',
]);
const MIN_BYTES = 1024;

async function compress(file: string): Promise<number> {
  const source = await readFile(file);
  if (source.length < MIN_BYTES) return 0;
  const [br, gz] = await Promise.all([
    brotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
    gzipped(source, { level: 9 }),
  ]);
  await Promise.all([writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gz)]);
  return source.length - br.length;
}

/** Writes a `.br` and a `.gz` beside every compressible file of at least 1 KiB,
 *  for a server that serves them precompressed, and answers how many files it
 *  compressed and how many bytes brotli saved. */
export async function precompress(
  files: readonly string[],
): Promise<{ assets: number; saved: number }> {
  const queue = files.filter((file) => COMPRESSIBLE.has(extname(file)));
  let assets = 0;
  let saved = 0;
  let next = 0;
  const work = async () => {
    for (let file = queue[next++]; file !== undefined; file = queue[next++]) {
      const gain = await compress(file);
      if (gain > 0) {
        assets += 1;
        saved += gain;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(availableParallelism(), queue.length) }, work));
  return { assets, saved };
}
