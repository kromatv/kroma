import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getCacheKey, type TransformInput, transform } from './mdx-transformer.cjs';

const VARIABLE = 'KROMA_METRO_BABEL_TRANSFORMER';

const inherited = process.env[VARIABLE];

const made: string[] = [];

// Metro forwards none of its own config to a babel transformer, so the one this
// one wraps arrives through the environment its workers inherit. A stand-in per
// test rather than one for all of them: node's require cache is keyed on path.
function wraps(source: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-mdx-transformer-'));
  made.push(dir);
  const file = join(dir, 'upstream.cjs');
  writeFileSync(file, source);
  process.env[VARIABLE] = file;
}

const ECHO = 'module.exports = { transform: (input) => input };';

const going = (filename: string, src: string): TransformInput => ({
  src,
  filename,
  options: { dev: false },
  plugins: null,
});

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (inherited === undefined) delete process.env[VARIABLE];
  else process.env[VARIABLE] = inherited;
});

describe('the transformer Metro reaches a .docs.mdx through', () => {
  it('compiles the file to a component before the transformer it wraps sees it', async () => {
    wraps(ECHO);

    const out = (await transform(going('/kit/list-row.docs.mdx', '# Anatomy\n'))) as TransformInput;

    expect(out.src).toContain('MDXContent');
    expect(out.src).toContain('Anatomy');
    expect(out.filename).toBe('/kit/list-row.docs.mdx');
    expect(out.options).toEqual({ dev: false });
  });

  it('hands every other file down untouched', async () => {
    wraps(ECHO);

    const out = (await transform(
      going('/kit/list-row.tsx', 'export const a = 1;'),
    )) as TransformInput;

    expect(out.src).toBe('export const a = 1;');
  });

  it('names the variable it is missing rather than failing inside require', async () => {
    delete process.env[VARIABLE];

    await expect(transform(going('/kit/list-row.tsx', ''))).rejects.toThrow(VARIABLE);
  });

  it('keys the transform cache on its own source, under the key it wraps', () => {
    wraps("module.exports = { transform: (input) => input, getCacheKey: () => 'upstream' };");

    expect(getCacheKey()).toMatch(/^upstream\$[0-9a-f]{64}$/);
  });

  it('keys on its own source alone where the wrapped transformer has no key', () => {
    wraps(ECHO);

    expect(getCacheKey()).toMatch(/^\$[0-9a-f]{64}$/);
  });
});
